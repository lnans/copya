import { t } from "@/i18n/fr"

export function AppFooter() {
  return (
    <footer className="mt-auto w-full border-t bg-muted/40 text-muted-foreground">
      <div className="flex w-full flex-col gap-4 px-3 py-8 text-xs leading-relaxed sm:px-4 sm:text-sm md:px-6">
        <p>{t.footer.about}</p>
        <p>{t.footer.developedBy}</p>

        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <p className="font-medium text-foreground">{t.footer.scientificTeamTitle}</p>
            <p className="mt-1">{t.footer.scientificTeamMembers}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">{t.footer.developerTitle}</p>
            <p className="mt-1">{t.footer.developerName}</p>
          </div>
        </div>

        <p className="text-[11px] sm:text-xs">{t.footer.copyright}</p>
        <p className="text-[11px] italic sm:text-xs">{t.footer.disclaimer}</p>
      </div>
    </footer>
  )
}
