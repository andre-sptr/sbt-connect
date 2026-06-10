import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Breadcrumb = {
  label: string;
  href?: string;
};

type DashboardPageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
};

export function DashboardPageHeader({
  title,
  description,
  breadcrumbs,
  backHref,
  backLabel = "Kembali",
  actions,
}: DashboardPageHeaderProps) {
  return (
    <div className="space-y-3">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.href ? (
                <Link href={item.href} className="hover:text-primary hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {backHref ? (
            <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1 w-fit text-muted-foreground">
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
          ) : null}
          <h1 className="break-words text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
