import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { Logo, ThemeToggle } from "@/components/chrome"
import { RunLog } from "@/components/logs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, api, queryKeys } from "@/lib/api"
import { LoginPage } from "@/pages/login"
import { OverviewPage } from "@/pages/overview"
import { ProjectPage, type ProjectTab } from "@/pages/project"

// Apply the saved theme before the first paint (the toggle keeps it in sync afterwards).
try {
  const t = localStorage.getItem("adlc-theme") ?? "system"
  document.documentElement.classList.toggle("dark", t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches))
} catch { /* private mode */ }

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
    <div className="app-glow min-h-svh">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-4 md:px-6 md:py-6">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="text-lg"><Logo /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()}><LogOut /><span className="hidden sm:inline">Sign out</span></Button>
          </div>
        </header>
        <main className="min-w-0"><Outlet /></main>
      </div>
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <p className="text-sm"><Link to="/p/$slug" params={{ slug }} search={{ tab: "history" }} className="text-muted-foreground hover:text-foreground">← {slug}</Link></p>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run for #{file.split("-")[0]}</h1>
          <p className="font-mono text-xs text-muted-foreground">{file}</p>
        </div>
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
