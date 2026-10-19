import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { RunLog } from "@/components/logs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, api, queryKeys } from "@/lib/api"
import { LoginPage } from "@/pages/login"
import { OverviewPage } from "@/pages/overview"
import { ProjectPage, type ProjectTab } from "@/pages/project"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, err) => !(err instanceof ApiError && err.status === 401) && n < 2,
    },
  },
})
// A 401 anywhere (token rotated, cookie expired) sends the user back to sign-in.
queryClient.getQueryCache().subscribe((e) => {
  if (e.type === "updated" && e.query.state.error instanceof ApiError && e.query.state.error.status === 401) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.session })
  }
})

function Shell() {
  const qc = useQueryClient()
  const session = useQuery({ queryKey: queryKeys.session, queryFn: api.session })
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.session }) })
  if (session.isPending) return <div className="p-6"><Skeleton className="h-10 w-60" /></div>
  if (session.isError) return <p className="p-6 text-destructive">Dashboard server unreachable: {session.error.message}</p>
  if (!session.data.authenticated) return <LoginPage configured={session.data.configured} />
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-4 md:px-6">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold tracking-tight">ADLC</Link>
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()}><LogOut />Sign out</Button>
      </header>
      <main><Outlet /></main>
    </div>
  )
}

const rootRoute = createRootRoute({ component: Shell })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage })
const TABS: ProjectTab[] = ["now", "queue", "attention", "history", "health"]
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$slug",
  validateSearch: (s: Record<string, unknown>): { tab?: ProjectTab } =>
    TABS.includes(s.tab as ProjectTab) ? { tab: s.tab as ProjectTab } : {},
  component: function ProjectRoute() {
    const { slug } = projectRoute.useParams()
    const { tab } = projectRoute.useSearch()
    return <ProjectPage slug={slug} tab={tab ?? "now"} />
  },
})
const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$slug/runs/$file",
  component: function RunRoute() {
    const { slug, file } = runRoute.useParams()
    return (
      <div className="grid gap-3">
        <p className="text-sm"><Link to="/p/$slug" params={{ slug }} className="hover:underline">← {slug}</Link></p>
        <h1 className="text-xl font-semibold">Run #{file.split("-")[0]} <span className="font-mono text-sm text-muted-foreground">{file}</span></h1>
        <RunLog slug={slug} file={file} />
      </div>
    )
  },
})

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, projectRoute, runRoute]) })
declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
