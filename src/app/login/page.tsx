import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-red-700 text-xl font-bold text-white shadow-soft">
            SBT
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Bot Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">Masuk untuk mengatur projek pengiriman WhatsApp otomatis.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
