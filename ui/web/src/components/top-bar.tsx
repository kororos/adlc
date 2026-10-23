import { Link, useRouterState } from "@tanstack/react-router"
import { Fragment } from "react"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"

const TAB_LABEL: Record<string, string> = { now: "Now", queue: "Queue", epics: "Epics", deps: "Dependencies", attention: "Needs you", ci: "CI", history: "History", health: "Health" }

export function TopBar() {
  const crumbs = useRouterState({
    select: (s) => {
      const path = s.location.pathname
      const tab = (s.location.search as { tab?: string }).tab ?? "now"
      const m = path.match(/^\/p\/([^/]+)(?:\/runs\/(([^-/]+)-[^/]+))?/)
      const out: { label: string; to?: string; params?: Record<string, string>; search?: Record<string, string> }[] = [{ label: "Projects", to: "/" }]
      if (m) {
        out.push({ label: m[1], to: "/p/$slug", params: { slug: m[1] }, search: { tab: "now" } })
        if (m[2]) out.push({ label: "History", to: "/p/$slug", params: { slug: m[1] }, search: { tab: "history" } }, { label: `Run #${m[3]}` })
        else out.push({ label: TAB_LABEL[tab] ?? "Now" })
      }
      return out
    },
    structuralSharing: true,
  })
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1" />
      <span aria-hidden className="mr-1 h-4 w-px bg-border" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i < crumbs.length - 1 && c.to
                  ? <BreadcrumbLink render={<Link to={c.to} params={c.params} search={c.search} />}>{c.label}</BreadcrumbLink>
                  : <BreadcrumbPage>{c.label}</BreadcrumbPage>}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
