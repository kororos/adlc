import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useRouterState } from "@tanstack/react-router"
import { BookOpen, ChevronRight, ExternalLink, FolderGit2, HeartPulse, History, Inbox, Layers, LayoutGrid, ListOrdered, LogOut, Network, Radio, Workflow } from "lucide-react"
import { Logo, ThemeToggle } from "@/components/chrome"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar"
import { api, queryKeys, type ProjectSummary } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { ProjectTab } from "@/pages/project"

// Where we are: /p/<slug>?tab=<tab> or /p/<slug>/runs/<file> (a run belongs under History).
function useLocation() {
  return useRouterState({
    select: (s) => {
      const m = s.location.pathname.match(/^\/p\/([^/]+)(\/runs\/)?/)
      const search = s.location.search as { tab?: ProjectTab }
      return { slug: m?.[1] ?? null, tab: (m?.[2] ? "history" : search.tab ?? "now") as ProjectTab, home: s.location.pathname === "/" }
    },
  })
}

function statusDot(p: ProjectSummary) {
  if (p.paused) return "bg-amber-500"
  if (p.backoffUntil) return "bg-orange-500"
  return "bg-emerald-500"
}

const SECTIONS: { tab: ProjectTab; label: string; icon: typeof Radio }[] = [
  { tab: "now", label: "Now", icon: Radio },
  { tab: "queue", label: "Queue", icon: ListOrdered },
  { tab: "epics", label: "Epics", icon: Layers },
  { tab: "deps", label: "Dependencies", icon: Network },
  { tab: "attention", label: "Needs you", icon: Inbox },
  { tab: "ci", label: "CI", icon: Workflow },
  { tab: "history", label: "History", icon: History },
  { tab: "health", label: "Health", icon: HeartPulse },
]

export function AppSidebar() {
  const qc = useQueryClient()
  const loc = useLocation()
  const { setOpenMobile } = useSidebar()
  const projects = useQuery({ queryKey: queryKeys.projects, queryFn: api.projects, refetchInterval: 10_000 })
  const version = useQuery({ queryKey: queryKeys.version, queryFn: api.version, staleTime: Infinity })
  const commit = version.data?.commit
  // Whatever the server says, end up on the sign-in page (the session query decides).
  const logout = useMutation({ mutationFn: api.logout, onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.session }) })
  const needYouTotal = (projects.data ?? []).reduce((n, p) => n + p.attention + p.reviews, 0)
  const close = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" onClick={close} />} tooltip="ADLC">
              <Logo className="text-base [&>svg]:size-8! group-data-[collapsible=icon]:[&>span]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={loc.home} tooltip="Overview" render={<Link to="/" onClick={close} />}>
                <LayoutGrid /><span>Overview</span>
              </SidebarMenuButton>
              {needYouTotal > 0 && <SidebarMenuBadge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{needYouTotal}</SidebarMenuBadge>}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarMenu>
            {(projects.data ?? []).map((p) => {
              const here = loc.slug === p.slug
              const needYou = p.attention + p.reviews
              const counts: Partial<Record<ProjectTab, number | string>> = {
                now: p.active.length ? `#${p.active[0].issue}` : "",
                queue: (p.counts?.ready ?? 0) + (p.counts?.queued ?? 0) || "",
                attention: needYou || "",
                ci: p.ciRunning || "",
              }
              return (
                <Collapsible key={p.slug} defaultOpen={here || (projects.data?.length ?? 0) === 1} render={<SidebarMenuItem />}>
                  <SidebarMenuButton tooltip={`${p.slug}${p.paused ? " (paused)" : ""}`}
                    render={<CollapsibleTrigger />} className="group/project">
                    <FolderGit2 />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className={cn("size-2 shrink-0 rounded-full", statusDot(p))} />
                      <span className="truncate font-medium">{p.slug}</span>
                    </span>
                    {needYou > 0
                      ? <span className="rounded-md bg-amber-500/15 px-1.5 text-xs font-medium text-amber-700 tabular-nums dark:text-amber-400">{needYou}</span>
                      : null}
                    <ChevronRight className="transition-transform group-data-[panel-open]/project:rotate-90" />
                  </SidebarMenuButton>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {SECTIONS.map(({ tab, label, icon: Icon }) => (
                        <SidebarMenuSubItem key={tab}>
                          <SidebarMenuSubButton isActive={here && loc.tab === tab}
                            render={<Link to="/p/$slug" params={{ slug: p.slug }} search={{ tab }} onClick={close} />}>
                            <Icon className={cn(tab === "now" && p.active.length && "text-primary!")} />
                            <span className="flex-1">{label}</span>
                            {counts[tab] ? (
                              <span className={cn("text-xs tabular-nums text-muted-foreground",
                                tab === "attention" && "font-medium text-amber-700 dark:text-amber-400",
                                tab === "now" && "flex items-center gap-1 font-medium text-primary")}>
                                {tab === "now" && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
                                {counts[tab]}
                              </span>
                            ) : null}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer" className="text-muted-foreground">
                          <ExternalLink /><span>GitHub</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
            {projects.data?.length === 0 && <p className="px-2 text-xs text-muted-foreground">No projects yet.</p>}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:hidden">
          <ThemeToggle />
          {commit && (
            <a href={`https://github.com/kororos/adlc/commit/${commit}`} target="_blank" rel="noreferrer" title="The ADLC commit this dashboard runs"
              className="font-mono text-xs text-muted-foreground hover:text-primary">ADLC {commit}</a>
          )}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="ADLC guide: tutorials and reference" render={<a href="/guide/" target="_blank" rel="noreferrer" />}>
              <BookOpen /><span>Guide</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={() => logout.mutate()}>
              <LogOut /><span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
