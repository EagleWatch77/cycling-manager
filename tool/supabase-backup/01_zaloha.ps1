# ZÁLOHA produkčnej databázy. IBA ČÍTA z databázy (pg_dump, SELECT). Nič nezapisuje, nemaže ani neobnovuje v produkcii.
# Heslo sa pýta skryto, je len v pamäti procesu a premennej PGPASSWORD tohto procesu; po skončení sa zmaže.
. (Join-Path (Join-Path $PSScriptRoot 'lib') '_spolocne.ps1')
$koniec = 0
try {
    Reset-PgProstredie
    Nadpis 'Záloha produkčnej databázy (iba čítanie)'
    $tools = @(Find-PgTools)
    if ($tools.Count -eq 0) { Stop-Skript 'Chýbajú nástroje PostgreSQL. Spusti najprv 00_over_nastroje a pozri NAVOD (kapitola 2).' }
    $t = $tools[0]
    $koren = Test-MiestoZalohy (Get-KorenZaloh)

    Write-Host ''
    Write-Host 'Zadaj údaje zo Supabase (Connect -> Session pooler). Zadávaj ich po jednom; celý connection string NEVKLADAJ.' -ForegroundColor Cyan
    $dbHost = Read-Udaj 'Host (napr. aws-0-xxx.pooler.supabase.com)' ''
    $port = Read-Udaj 'Port [5432]' '5432'
    $user = Read-Udaj 'Používateľ (napr. postgres.abcdefgh)' ''
    $db = Read-Udaj 'Databáza [postgres]' 'postgres'
    Over-Udaj 'Host' $dbHost; Over-Udaj 'Používateľ' $user; Over-Udaj 'Databáza' $db
    if ($port -notmatch '^\d{2,5}$') { Stop-Skript 'Port musí byť číslo (5432).' }
    if ($port -eq '6543') { Stop-Skript "Port 6543 je 'Transaction pooler' – na zálohu nevhodný. Použi 'Session pooler' (port 5432)." }
    if ($dbHost -match '^db\.[a-z0-9]+\.supabase\.co$') { Varuj "Toto je 'Direct connection' (IPv6). Na väčšine domácich sietí nefunguje; ak zlyhá, použi Session pooler." }
    Read-Heslo 'Heslo databázy (písanie sa nezobrazuje; potvrď Enterom)'
    $conn = New-SpojenieArgs $dbHost $port $user $db

    Nadpis '1. Skúšam spojenie (iba čítanie)'
    $r = Invoke-Pg $t.Psql ($conn + @('-X', '-A', '-t', '-q', '-F', '|', '-c', "select current_database(), current_setting('server_version_num')::int/10000, pg_size_pretty(pg_database_size(current_database()))"))
    if ($r.Code -ne 0) { Stop-Skript ("Nepodarilo sa pripojiť. Chyba:`n" + $r.Err.Trim() + "`nSkontroluj údaje, heslo a že ide o Session pooler (NAVOD, kapitola 'Ak niečo zlyhá').") }
    $pp = $r.Out.Trim().Split('|'); $dbName = $pp[0]; $serverMajor = [int]$pp[1]; $velkost = $pp[2]
    Info ("databáza '{0}', PostgreSQL {1}, veľkosť {2}; tvoj pg_dump: {3}" -f $dbName, $serverMajor, $velkost, $t.Major)
    if ($t.Major -lt $serverMajor) { Stop-Skript ("Tvoj pg_dump ($($t.Major)) je starší než databáza ($serverMajor). Nainštaluj PostgreSQL $serverMajor alebo novší (NAVOD, kapitola 2). Záloha sa NEUROBILA.") }
    Ok 'verzia nástrojov je v poriadku'

    $cielDir = New-UnikatnyPriecinok $koren 'pred-migraciou-A'   # vždy nový prázdny priečinok; existujúca záloha sa nikdy neprepíše
    Protect-Priecinok $cielDir
    Info "Záloha sa ukladá do: $cielDir"

    Nadpis '2. Čo v databáze je (odtlačok PRED zálohou) a čo sa NEDÁ zálohovať dumpom'
    $inv = Invoke-Pg $t.Psql ($conn + @('-X', '-A', '-t', '-q', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-f', $script:InventorySql))
    if ($inv.Code -ne 0) { Stop-Skript ("Inventár zlyhal:`n" + $inv.Err.Trim()) }
    Zapis-Text (Join-Path $cielDir 'inventar_pred.txt') $inv.Out
    $invTab = Read-Inventar (Join-Path $cielDir 'inventar_pred.txt')
    $nepristupne = @($invTab.Keys | Where-Object { $_ -like 'table|*' -and [string]$invTab[$_] -eq 'ERR' })
    if ($nepristupne.Count -gt 0) { Varuj ("Rola nemôže čítať tieto tabuľky (obsah sa nedá overiť, záloha nebude označená ako úplne overená): " + (($nepristupne | ForEach-Object { $_ -replace '^table\|', '' }) -join ', ')) }
    $nPublic = @($invTab.Keys | Where-Object { $_ -like 'table|public.*' }).Count
    Info ("tabuliek v 'public': $nPublic; auth.users: " + $(if ($invTab.Contains('table|auth.users')) { $invTab['table|auth.users'] } else { 'nedostupné' }))
    function Dopyt([string]$sql) { $x = Invoke-Pg $t.Psql ($conn + @('-X', '-A', '-t', '-q', '-F', '|', '-c', $sql)); if ($x.Code -eq 0) { return $x.Out.Trim() } else { return $null } }
    $tzProd = ''
    $x = Invoke-Pg $t.Psql ($conn + @('-X', '-A', '-t', '-q', '-c', 'show timezone')); if ($x.Code -eq 0) { $tzProd = $x.Out.Trim() }
    Write-Host '  Robím odtlačok OBSAHU tabuliek (každý riadok sa zhashuje; iba čítanie) – môže chvíľu trvať...'
    $zl1 = Write-ObsahHash $t $conn $invTab (Join-Path $cielDir 'obsah_pred.txt') ''
    if ($zl1 -gt 0) { Varuj "Odtlačok obsahu zlyhal pri $zl1 tabuľkách (pozri obsah_pred.txt). Takú zálohu overenie 02 nepovažuje za úplne overenú." } else { Ok 'odtlačok obsahu pred zálohou hotový' }
    $extra = New-Object System.Collections.ArrayList
    $rl = Dopyt "select rolsuper::text || '|' || rolbypassrls::text from pg_roles where rolname = current_user"
    if ($rl -and $rl -match 'false\|false') { Varuj 'Používateľ nemá bypassrls ani superuser: tabuľky s RLS by pg_dump nemusel vedieť prečítať. Overenie 02 to zachytí.' }
    $so = Dopyt "select count(*) || '|' || coalesce(sum((metadata->>'size')::bigint),0) from storage.objects"
    if ($so) { $a = $so.Split('|'); [void]$extra.Add("STORAGE_SUBORY=$($a[0]) objektov, $([math]::Round([double]$a[1]/1MB,1)) MB"); if ([int]$a[0] -gt 0) { Varuj ("Storage obsahuje {0} súborov ({1} MB). Dump zálohuje len ich ZOZNAM, nie samotné súbory. Súbory si treba stiahnuť zvlášť." -f $a[0], [math]::Round([double]$a[1]/1MB,1)) } else { Ok 'Storage nemá žiadne súbory (nie je čo strácať).' } } else { [void]$extra.Add('STORAGE_SUBORY=nezistene'); Varuj 'Nepodarilo sa zistiť, či Storage obsahuje súbory. Súbory nie sú v dumpe.' }
    $vs = Dopyt 'select count(*) from vault.secrets'
    if ($vs) { [void]$extra.Add("VAULT_SECRETS=$vs"); if ([int]$vs -gt 0) { Varuj "Vault obsahuje $vs tajomstiev. Sú šifrované kľúčom projektu: v inom projekte sa NEDAJÚ prečítať. Zapíš si ich zvlášť." } }
    $cj = Dopyt 'select count(*) from cron.job'
    if ($cj) { [void]$extra.Add("CRON_JOBY=$cj"); if ([int]$cj -gt 0) { Varuj "Databáza má $cj naplánovaných úloh (pg_cron). Ich definície sú v dumpe, ale over si ich po obnove." } }
    $ex = Dopyt "select string_agg(extname || ' ' || extversion, ', ' order by extname) from pg_extension"
    if ($ex) { [void]$extra.Add("ROZSIRENIA=$ex") }
    $cr = Dopyt "select string_agg(rolname, ', ' order by rolname) from pg_roles where rolname !~ '^(pg_|supabase|authenticator|anon$|authenticated$|service_role$|dashboard_user|pgbouncer|postgres$|cli_login|pgsodium)'"
    if ($cr) { [void]$extra.Add("VLASTNE_ROLY=$cr"); Varuj "Databáza má vlastné roly ($cr). Roly a ich heslá sa dumpom NEZÁLOHUJÚ (Supabase nedovolí pg_dumpall)." }
    Zapis-Text (Join-Path $cielDir 'info_projektu.txt') (($extra -join "`r`n") + "`r`n")

    Nadpis '3. Hlavná záloha (celá databáza, formát .dump) – môže trvať minútu až niekoľko minút'
    $dumpFile = Join-Path $cielDir 'uplna_zaloha.dump'
    if (Test-Path -LiteralPath $dumpFile) { Stop-Skript "Súbor $dumpFile už existuje. Nikdy nič neprepisujem." }
    $rozsah = 'plna'
    $d1 = Invoke-Pg $t.Dump ($conn + @('--format=custom', '--verbose', '--file', $dumpFile))
    Zapis-Text (Join-Path $cielDir 'log_zaloha.txt') ("== uplna zaloha, kod {0} ==`r`n{1}`r`n" -f $d1.Code, $d1.Err)
    if ($d1.Code -ne 0) {
        Varuj 'Úplná záloha zlyhala (často kvôli právam na Supabase spravované schémy). Posledné riadky chyby:'
        ($d1.Err -split "`n" | Where-Object { $_ -match 'error|ERROR|denied' } | Select-Object -First 4) | ForEach-Object { Info $_.Trim() }
        Varuj "Skúšam ČIASTOČNÚ zálohu len schémy 'public'. Nebude označená ako úplná (auth a storage metadáta v nej NIE SÚ)."
        Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue
        $d1 = Invoke-Pg $t.Dump ($conn + @('--format=custom', '--verbose', '--schema=public', '--file', $dumpFile))
        Zapis-Text (Join-Path $cielDir 'log_zaloha.txt') ("== ciastocna zaloha (public), kod {0} ==`r`n{1}`r`n" -f $d1.Code, $d1.Err)
        if ($d1.Code -ne 0) { Stop-Skript "Ani záloha schémy 'public' sa nepodarila. Záloha NEEXISTUJE. Neprechádzaj k migrácii A. Pozri log_zaloha.txt." }
        $rozsah = 'public'
    }
    Ok ("hlavná záloha hotová (rozsah: {0})" -f $(if ($rozsah -eq 'plna') { 'celá databáza' } else { 'IBA public – ČIASTOČNÁ' }))

    Nadpis '4. Čitateľná záloha schémy public (štruktúra + dáta, obyčajný SQL text)'
    $d2 = Invoke-Pg $t.Dump ($conn + @('--schema=public', '--no-owner', '--file', (Join-Path $cielDir 'public_struktura_a_data.sql')))
    if ($d2.Code -ne 0) { Stop-Skript ("Záloha public (SQL) zlyhala:`n" + $d2.Err.Trim()) }
    Ok 'hotovo'
    if ($rozsah -eq 'plna') {
        Nadpis '5. Čitateľná záloha štruktúry celej databázy (bez dát)'
        $d3 = Invoke-Pg $t.Dump ($conn + @('--schema-only', '--no-owner', '--file', (Join-Path $cielDir 'struktura_vsetkeho.sql')))
        if ($d3.Code -ne 0) { Varuj 'Záloha štruktúry celej databázy zlyhala (doplnkový súbor, hlavný .dump je v poriadku).' } else { Ok 'hotovo' }
    }

    Nadpis '6. Odtlačok PO zálohe (či sa medzitým niečo menilo)'
    $inv2 = Invoke-Pg $t.Psql ($conn + @('-X', '-A', '-t', '-q', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-f', $script:InventorySql))
    if ($inv2.Code -ne 0) { Stop-Skript ("Inventár po zálohe zlyhal:`n" + $inv2.Err.Trim()) }
    Zapis-Text (Join-Path $cielDir 'inventar_po.txt') $inv2.Out
    $invPo = Read-Inventar (Join-Path $cielDir 'inventar_po.txt')
    $zl2 = Write-ObsahHash $t $conn $invPo (Join-Path $cielDir 'obsah_po.txt') ''
    if ($zl2 -gt 0) { Varuj "Odtlačok obsahu po zálohe zlyhal pri $zl2 tabuľkách." } else { Ok 'odtlačok obsahu po zálohe hotový' }
    $zmena = 0
    if ($inv.Out -ne $inv2.Out) { $zmena = 1; Varuj 'Počas zálohy sa v databáze niečo zmenilo (hráči hrali). Záloha je napriek tomu konzistentný snímok z jedného okamihu; overenie 02 s tým počíta. Pre úplne čistý odtlačok zálohu zopakuj v čase, keď nikto nehrá.' } else { Ok 'databáza sa počas zálohy nezmenila' }

    Nadpis '7. Kontrolné súčty a popis (bez hesiel a bez údajov o spojení)'
    $sumy = @()
    foreach ($f in @('uplna_zaloha.dump', 'public_struktura_a_data.sql', 'struktura_vsetkeho.sql', 'inventar_pred.txt', 'inventar_po.txt', 'obsah_pred.txt', 'obsah_po.txt', 'info_projektu.txt')) {
        $c = Join-Path $cielDir $f
        if (Test-Path -LiteralPath $c) { $sumy += ('{0}  {1}' -f (Get-FileHash -LiteralPath $c -Algorithm SHA256).Hash.ToLowerInvariant(), $f) }
    }
    Zapis-Text (Join-Path $cielDir 'SHA256SUMS.txt') (($sumy -join "`r`n") + "`r`n")
    $popis = @(
        "DATUM=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "ROZSAH=$rozsah",
        "SERVER_MAJOR=$serverMajor",
        "TIMEZONE=$tzProd",
        "DATABAZA_VELKOST=$velkost",
        "PG_DUMP_MAJOR=$($t.Major)",
        "PG_DUMP_VERZIA=$($t.Verzia)",
        "ZMENA_POCAS_ZALOHY=$zmena",
        "SKRIPTY=$($script:VerziaSkriptov)",
        'STAV=NEOVERENA (spusti 02_over_zalohu)',
        'POZNAMKA=Tento subor neobsahuje heslo ani udaje o spojeni.'
    )
    Zapis-Text (Join-Path $cielDir 'POPIS_ZALOHY.txt') (($popis -join "`r`n") + "`r`n")
    Ok 'hotovo'

    Write-Host ''
    Write-Host 'ZÁLOHA VYTVORENÁ, ale ešte NIE JE OVERENÁ. Nepovažuj ju za hotovú, kým 02_over_zalohu nehlási výsledok.' -ForegroundColor Yellow
    Write-Host ("Priečinok: $cielDir")
    Write-Host ''
    Write-Host 'Čo záloha NEOBSAHUJE (dumpom sa to zálohovať nedá):' -ForegroundColor Yellow
    Info '- samotné súbory zo Storage (je len ich zoznam)'
    Info '- Vault tajomstvá (šifrované kľúčom projektu), Edge Functions, secrets, env premenné, nastavenia Auth/SMTP/URL'
    Info '- roly a ich heslá (okrem toho, čo je v schémach)'
    if ($rozsah -ne 'plna') { Write-Host '- !!! TÁTO ZÁLOHA JE IBA ČIASTOČNÁ: auth (používatelia) a storage metadáta v nej NIE SÚ.' -ForegroundColor Red }
    Write-Host ''
    Write-Host 'ĎALEJ: spusti 02_over_zalohu. Potom skopíruj priečinok na druhé miesto (USB disk) – NIKDY do GitHubu ani do ZIP-u projektu.'
} catch {
    Chyba (Mask-Text $_.Exception.Message); $koniec = 1
} finally {
    Clear-Heslo
}
exit $koniec
