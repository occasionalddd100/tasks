import { useState } from "react";
import { sb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [email, setEmail] = useState(""), [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr("");
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr(error.message === "Invalid login credentials" ? "Неверная почта или пароль" : "Не вошёл: " + error.message);
  };
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-2.5">
        <Input type="email" placeholder="Почта" required autoComplete="username" autoFocus value={email} onChange={e => setEmail(e.target.value)} />
        <Input type="password" placeholder="Пароль" required autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
        <Button disabled={busy}>Войти</Button>
        <p className="min-h-5 text-center text-sm text-destructive" role="alert">{err}</p>
      </form>
    </div>
  );
}
