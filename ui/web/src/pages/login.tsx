import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, queryKeys } from "@/lib/api"

export function LoginPage({ configured }: { configured: boolean }) {
  const qc = useQueryClient()
  const [token, setToken] = useState("")
  const m = useMutation({
    mutationFn: () => api.login(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.session }),
  })
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ADLC dashboard</CardTitle>
          <CardDescription>Sign in with the dashboard token. Show it on the dev server with <code>adlc ui token</code>.</CardDescription>
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
