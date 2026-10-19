import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/chrome"
import { api, queryKeys } from "@/lib/api"

export function LoginPage({ configured }: { configured: boolean }) {
  const qc = useQueryClient()
  const [token, setToken] = useState("")
  const m = useMutation({
    mutationFn: () => api.login(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.session }),
  })
  return (
    <div className="app-glow flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <Logo className="text-2xl" />
      <Card className="w-full max-w-sm shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle>Sign in to the dashboard</CardTitle>
          <CardDescription>Paste the token that <code className="rounded bg-muted px-1 py-0.5">adlc ui token</code> prints on the dev server.</CardDescription>
        </CardHeader>
        <CardContent>
          {!configured ? (
            <Alert><AlertDescription>No token is set up yet. Run <code>adlc ui up</code> on the dev server.</AlertDescription></Alert>
          ) : (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
              <div className="grid gap-2">
                <Label htmlFor="token">Token</Label>
                <Input id="token" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} required />
              </div>
              {m.isError && <p className="text-sm text-destructive" role="alert">{(m.error as Error).message}</p>}
              <Button type="submit" disabled={m.isPending || !token}>Sign in</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
