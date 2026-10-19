import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { AppSidebar } from "@/components/app-sidebar"
import { RunLog } from "@/components/logs"
import { TopBar } from "@/components/top-bar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
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

// The sidebar remembers expanded/collapsed in a cookie it writes itself.
const sidebarOpen = () => !document.cookie.split("; ").includes("sidebar_state=false")

function Shell() {
  const session = useQuery({ queryKey: queryKeys.session, queryFn: api.session })
  if (session.isPending) return <div className="p-6"><Skeleton className="h-10 w-60" /></div>
  if (session.isError) return <p className="p-6 text-destructive">Dashboard server unreachable: {session.error.message}</p>
  if (!session.data.authenticated) return <LoginPage configured={session.data.configured} />
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen()}>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <TopBar />
          <div className="app-glow flex-1">
            <main className="mx-auto grid max-w-6xl min-w-0 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 md:px-6 md:py-6"><Outlet /></main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
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
