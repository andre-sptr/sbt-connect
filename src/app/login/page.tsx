import { LoginForm } from "@/components/login-form";

type Props = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const initialError = params?.error ? "Username atau password salah." : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="SBT Connect" className="mx-auto mb-4 h-14 w-14 rounded-lg shadow-soft" />
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Bot Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">Masuk untuk mengatur projek pengiriman WhatsApp otomatis.</p>
        </div>
        <LoginForm initialError={initialError} />
      </div>
    </main>
  );
}
