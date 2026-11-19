# Spoločné funkcie pre skripty zálohy. Windows PowerShell 5.1 (aj PowerShell 7).
# Heslo sa NIKDY nepíše do argumentov programov, súborov, logov ani histórie.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$script:Heslo = $null
$script:SkriptyKoren = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$script:InventorySql = Join-Path (Join-Path $script:SkriptyKoren 'sql') 'inventory.sql'
$script:JeWindows = ($env:OS -eq 'Windows_NT')
$script:VerziaSkriptov = '1.0-windows'

function Ok($t)   { Write-Host "  OK      $t" -ForegroundColor Green }
function Varuj($t){ Write-Host "  POZOR   $t" -ForegroundColor Yellow }
function Chyba($t){ Write-Host "  CHYBA   $t" -ForegroundColor Red }
function Info($t) { Write-Host "          $t" }
function Nadpis($t){ Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }
function Stop-Skript($t) { throw "STOP: $t" }

function Mask-Text([string]$t) {
    if ($null -eq $t) { return '' }
    if ($script:Heslo) { $t = $t.Replace($script:Heslo, '***') }
    return ([regex]::Replace($t, '(postgres(?:ql)?://[^:/\s]+:)[^@\s]+@', '$1***@'))
}

function Quote-Arg([string]$a) {
    if ($a -eq '') { return '""' }
    if ($a -notmatch '[\s"]') { return $a }
    $e = $a -replace '(\\*)"', '$1$1\"'
    $e = $e -replace '(\\+)$', '$1$1'
    return '"' + $e + '"'
}

# Spustí program BEZ shellu; heslo je len v premennej prostredia PGPASSWORD tohto procesu (nie v argumentoch).
function Invoke-Pg([string]$Exe, [string[]]$Argumenty) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = (($Argumenty | ForEach-Object { Quote-Arg $_ }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $p = [System.Diagnostics.Process]::Start($psi)
    $so = $p.StandardOutput.ReadToEndAsync()
    $se = $p.StandardError.ReadToEndAsync()
    $p.WaitForExit()
    return [pscustomobject]@{ Code = $p.ExitCode; Out = $so.Result; Err = (Mask-Text $se.Result) }
}

function Zapis-Text([string]$cesta, [string]$text) {
    [IO.File]::WriteAllText($cesta, $text, (New-Object Text.UTF8Encoding($false)))
}

# ---------- nástroje ----------
function Get-HlavnaVerzia([string]$text) {
    $m = [regex]::Match($text, '\)\s*(\d+)')
    if ($m.Success) { return [int]$m.Groups[1].Value }
    return 0
}
function Find-PgTools {
    $ext = ''; if ($script:JeWindows) { $ext = '.exe' }
    $dirs = New-Object System.Collections.ArrayList
    foreach ($n in @('pg_dump', 'psql', 'pg_restore')) {
        foreach ($c in @(Get-Command $n -All -ErrorAction SilentlyContinue)) {
            if ($c.Source) { [void]$dirs.Add((Split-Path -Parent $c.Source)) }
        }
    }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($base -and (Test-Path (Join-Path $base 'PostgreSQL'))) {
            foreach ($d in @(Get-ChildItem (Join-Path $base 'PostgreSQL') -Directory -ErrorAction SilentlyContinue)) {
                [void]$dirs.Add((Join-Path $d.FullName 'bin'))
            }
        }
    }
    [void]$dirs.Add((Join-Path (Join-Path $script:SkriptyKoren 'pgsql') 'bin'))
    if ($env:ZALOHA_PG_BIN) { [void]$dirs.Add($env:ZALOHA_PG_BIN) }
    $found = @{}
    foreach ($d in $dirs) {
        if (-not $d) { continue }
        $k = $d.TrimEnd('\', '/').ToLowerInvariant()
        if ($found.ContainsKey($k)) { continue }
        $dump = Join-Path $d ('pg_dump' + $ext); $rest = Join-Path $d ('pg_restore' + $ext); $sql = Join-Path $d ('psql' + $ext)
        if ((Test-Path $dump) -and (Test-Path $rest) -and (Test-Path $sql)) {
            $v = Invoke-Pg $dump @('--version')
            $found[$k] = [pscustomobject]@{ Bin = $d; Dump = $dump; Restore = $rest; Psql = $sql; Major = (Get-HlavnaVerzia $v.Out); Verzia = $v.Out.Trim() }
        }
    }
    return @($found.Values | Sort-Object Major -Descending)
}

# ---------- heslo a spojenie ----------
function Read-Heslo([string]$vyzva) {
    $sec = Read-Host -Prompt $vyzva -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ([string]::IsNullOrEmpty($plain)) { Stop-Skript 'Heslo je prázdne.' }
    $script:Heslo = $plain
    $env:PGPASSWORD = $plain          # iba pre tento proces a jeho deti; po skončení sa maže
}
function Clear-Heslo {
    $script:Heslo = $null
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
function Reset-PgProstredie {
    foreach ($n in 'PGHOST','PGHOSTADDR','PGPORT','PGPASSCOMMAND','PGUSER','PGDATABASE','PGSERVICE','PGPASSFILE','PGOPTIONS','PGSERVICEFILE') {
        Remove-Item "Env:$n" -ErrorAction SilentlyContinue
    }
    $env:PGSSLMODE = 'require'
    $env:PGCONNECT_TIMEOUT = '20'
    $env:PGCLIENTENCODING = 'UTF8'
    $env:PGAPPNAME = 'zaloha-skript'
}
function Read-Udaj([string]$vyzva, [string]$predvolene) {
    $t = Read-Host -Prompt $vyzva
    if ([string]::IsNullOrWhiteSpace($t)) { $t = $predvolene }
    return $t.Trim()
}
function Over-Udaj([string]$nazov, [string]$hodnota) {
    if ([string]::IsNullOrWhiteSpace($hodnota)) { Stop-Skript "$nazov je prázdne." }
    if ($hodnota -match '://|@|\s|["''`;&|<>]') {
        Stop-Skript "Do poľa '$nazov' si zadal(a) niečo, čo vyzerá ako celý connection string alebo obsahuje zakázané znaky. Zadávaj údaje po jednom (pozri NAVOD). Ak si tam vložil(a) heslo, zmeň si ho v Supabase."
    }
}
# Základné argumenty spojenia: heslo v nich NIE JE.
function New-SpojenieArgs([string]$h, [string]$port, [string]$user, [string]$db) {
    return @('-h', $h, '-p', $port, '-U', $user, '-d', $db, '-w')
}

# ---------- miesto zálohy ----------
function Test-MiestoZalohy([string]$cesta) {
    $full = [IO.Path]::GetFullPath($cesta)
    if ($full -match '(?i)[\\/](OneDrive[^\\/]*|Dropbox|Google Drive|iCloudDrive|GitHub)([\\/]|$)') {
        Stop-Skript "Priečinok '$full' je v cloudovom/synchronizovanom priečinku alebo v priečinku GitHub Desktop. Záloha tam nesmie byť. Použi napr. C:\Users\TVOJE_MENO\SupabaseZalohy."
    }
    $p = $full
    while ($p) {
        if (Test-Path -LiteralPath (Join-Path $p '.git')) { Stop-Skript "Priečinok '$full' je vo vnútri Git repozitára ($p). Záloha tam nesmie byť (nikdy do GitHubu ani do ZIP-u projektu)." }
        $par = [IO.Directory]::GetParent($p)
        if ($null -eq $par) { break }
        $p = $par.FullName
    }
    return $full
}
function Get-KorenZaloh {
    if ($env:ZALOHY_KOREN) { return $env:ZALOHY_KOREN }
    $home2 = $env:USERPROFILE; if (-not $home2) { $home2 = $env:HOME }
    return (Join-Path (Join-Path $home2 'SupabaseZalohy') 'cycling-manager')
}
function Protect-Priecinok([string]$dir) {
    if (-not $script:JeWindows) { return }
    try {
        $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls.exe $dir /inheritance:r /grant:r ("{0}:(OI)(CI)F" -f $me) 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Varuj 'Nepodarilo sa obmedziť prístup k priečinku len na teba (nie je to kritické).' }
    } catch { Varuj 'Nepodarilo sa obmedziť prístup k priečinku len na teba (nie je to kritické).' }
}

# ---------- inventár a porovnanie ----------
# riadok "druh|názov|zvyšok" -> kľúč "druh|názov", hodnota "zvyšok"
function Read-Inventar([string]$subor) {
    $h = [ordered]@{}
    foreach ($l in @(Get-Content -LiteralPath $subor -Encoding UTF8)) {
        if ([string]::IsNullOrWhiteSpace($l)) { continue }
        $i = $l.IndexOf('|'); if ($i -lt 0) { continue }
        $j = $l.IndexOf('|', $i + 1); if ($j -lt 0) { continue }
        $h[$l.Substring(0, $j)] = $l.Substring($j + 1)
    }
    return $h
}
# počet riadkov v blokoch "COPY ... FROM stdin;" ... "\." v obyčajnom SQL texte
function Get-CopyPocty([string]$subor) {
    $h = @{}; $cur = $null; $n = 0
    $sr = New-Object IO.StreamReader($subor, [Text.Encoding]::UTF8)
    try {
        while ($null -ne ($line = $sr.ReadLine())) {
            if ($null -eq $cur) {
                if ($line.StartsWith('COPY ') -and $line.EndsWith(' FROM stdin;')) {
                    $m = [regex]::Match($line, '^COPY (.+?) (\(|FROM stdin;)')
                    $cur = ($m.Groups[1].Value -replace '"', ''); $n = 0
                }
            } elseif ($line -eq '\.') {
                if ($h.ContainsKey($cur)) { $h[$cur] += $n } else { $h[$cur] = $n }
                $cur = $null
            } else { $n++ }
        }
    } finally { $sr.Dispose() }
    return $h
}

# ---------- odtlačok OBSAHU (nie len počtu) riadkov ----------
# Každý riadok sa zhashuje (MD5 -> 64 bit) a hashe sa sčítajú (nezávisí od poradia ani od collation). Výsledok "počet|súčet".
if (-not ('ZalohaHash' -as [type])) {
    Add-Type -Language CSharp -TypeDefinition @'
using System; using System.Collections.Generic; using System.IO; using System.Security.Cryptography; using System.Text; using System.Text.RegularExpressions;
public static class ZalohaHash {
  static ulong H(MD5 md5, string s) { return BitConverter.ToUInt64(md5.ComputeHash(Encoding.UTF8.GetBytes(s)), 0); }
  public static string Stream(TextReader r) {
    long n = 0; ulong sum = 0; string l;
    using (MD5 md5 = MD5.Create()) { while ((l = r.ReadLine()) != null) { n++; sum = unchecked(sum + H(md5, l)); } }
    return n + "|" + sum;
  }
  // Prečíta obyčajný SQL text (výstup pg_restore / pg_dump): odtlačky tabuliek z COPY blokov a stavy sekvencií zo setval.
  public static Dictionary<string, string> Subor(string path) {
    var res = new Dictionary<string, string>(); var counts = new Dictionary<string, long>(); var sums = new Dictionary<string, ulong>();
    Regex copy = new Regex(@"^COPY (.+?) (\(|FROM stdin;)");
    Regex setval = new Regex(@"^SELECT pg_catalog\.setval\('(.+)', (-?\d+), (true|false)\);$");
    using (var sr = new StreamReader(path, new UTF8Encoding(false))) using (MD5 md5 = MD5.Create()) {
      string cur = null; string l;
      while ((l = sr.ReadLine()) != null) {
        if (cur == null) {
          if (l.StartsWith("COPY ") && l.EndsWith(" FROM stdin;")) {
            cur = copy.Match(l).Groups[1].Value.Replace("\"", "");
            if (!counts.ContainsKey(cur)) { counts[cur] = 0; sums[cur] = 0; }
          } else {
            var m = setval.Match(l);
            if (m.Success) { res["seq|" + m.Groups[1].Value.Replace("\"", "")] = m.Groups[2].Value + "|" + m.Groups[3].Value; }
          }
        } else if (l == @"\.") { cur = null; }
        else { counts[cur]++; sums[cur] = unchecked(sums[cur] + H(md5, l)); }
      }
    }
    foreach (var k in counts.Keys) res["tab|" + k] = counts[k] + "|" + sums[k];
    return res;
  }
}
'@
}

# Odtlačok obsahu jednej tabuľky z databázy: COPY ... TO STDOUT (rovnaký text ako v dumpe) -> hash. Iba čítanie.
function Get-TabulkaHash($t, [string[]]$conn, [string]$tab, [string]$cols, [string]$tz) {
    if ([string]::IsNullOrEmpty($cols)) { return '0|0' }
    $i = $tab.IndexOf('.'); $sch = $tab.Substring(0, $i); $nm = $tab.Substring($i + 1)
    $stm = 'copy "' + ($sch -replace '"', '""') + '"."' + ($nm -replace '"', '""') + '" (' + $cols + ') to stdout'
    $a = $conn + @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', "set datestyle = 'ISO'", '-c', 'set intervalstyle = postgres', '-c', 'set extra_float_digits = 1')
    if ($tz) { $a += @('-c', ("set timezone to '" + ($tz -replace "'", "''") + "'")) }
    $a += @('-c', $stm)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $t.Psql
    $psi.Arguments = (($a | ForEach-Object { Quote-Arg $_ }) -join ' ')
    $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $p = [System.Diagnostics.Process]::Start($psi)
    $se = $p.StandardError.ReadToEndAsync()
    $v = [ZalohaHash]::Stream($p.StandardOutput)
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) { return $null }
    return $v
}
# Odtlačky obsahu všetkých tabuliek z inventára do súboru (riadky "content|schema.tabuľka|počet|súčet" alebo "...|ERR"). Vráti počet zlyhaní.
function Write-ObsahHash($t, [string[]]$conn, $inv, [string]$subor, [string]$tz) {
    $riadky = New-Object System.Collections.ArrayList; $zlyhalo = 0
    foreach ($k in @($inv.Keys | Where-Object { $_ -like 'table|*' })) {
        $nm = $k -replace '^table\|', ''
        $cols = ''; if ($inv.Contains("copycols|$nm")) { $cols = $inv["copycols|$nm"] }
        $h = Get-TabulkaHash $t $conn $nm $cols $tz
        if ($null -eq $h) { $zlyhalo++; [void]$riadky.Add("content|$nm|ERR") } else { [void]$riadky.Add("content|$nm|$h") }
    }
    Zapis-Text $subor (($riadky -join "`r`n") + "`r`n")
    return $zlyhalo
}
# Porovná odtlačok obsahu: 'ok' | 'zle' (iné hodnoty) | 'nev' (nedá sa overiť: pri zálohe zlyhal odtlačok alebo sa tabuľka počas zálohy menila)
function Porovnaj-Obsah($obPre, $obPo, [string]$nm, [string]$aktual) {
    $k = "content|$nm"
    if (-not ($obPre.Contains($k) -and $obPo.Contains($k))) { return 'nev' }
    $a = [string]$obPre[$k]; $b = [string]$obPo[$k]
    if ($a -eq 'ERR' -or $b -eq 'ERR' -or $a -ne $b) { return 'nev' }
    if ($null -eq $aktual) { return 'zle' }
    if ($aktual -eq $a) { return 'ok' } else { return 'zle' }
}
# Sekvencie: hodnota "posledná|použitá(true/false)". Efektívna hodnota = posledná, alebo posledná-1 ak ešte nebola použitá.
function Get-SekvEfekt([string]$v) {
    $p = $v.Split('|'); $x = [decimal]$p[0]; if ($p[1] -ne 'true') { $x = $x - 1 }; return $x
}
function Test-Sekvencia([string]$pre, [string]$po, [string]$aktual) {
    if ([string]::IsNullOrEmpty($aktual)) { return $false }
    $a = Get-SekvEfekt $pre; $b = $a; if ($po) { $b = Get-SekvEfekt $po }; $x = Get-SekvEfekt $aktual
    return (($x -ge [math]::Min($a, $b)) -and ($x -le [math]::Max($a, $b)))
}

# ---------- NIKDY neprepísať existujúcu zálohu ----------
# Každé spustenie vytvorí úplne nový, prázdny priečinok: čas na sekundy + náhodný 8-miestny kód. New-Item bez -Force zlyhá, ak priečinok už existuje
# (vytvorenie je atómové); pri zhode sa skúsi iný náhodný kód. Parametre $cas/$sufix existujú iba pre testy.
function New-UnikatnyPriecinok([string]$koren, [string]$znacka, [string]$cas = '', [string]$sufix = '') {
    if (-not (Test-Path -LiteralPath $koren)) { New-Item -ItemType Directory -Path $koren -ErrorAction Stop | Out-Null }
    for ($i = 0; $i -lt 50; $i++) {
        $c = $cas; if ($c -eq '') { $c = Get-Date -Format 'yyyy-MM-dd_HHmmss' }
        $s = $sufix; if ($s -eq '' -or $i -gt 0) { $s = [Guid]::NewGuid().ToString('N').Substring(0, 8) }
        $dir = Join-Path $koren ("{0}_{1}_{2}" -f $c, $s, $znacka)
        if (Test-Path -LiteralPath $dir) { continue }
        try { New-Item -ItemType Directory -Path $dir -ErrorAction Stop | Out-Null } catch { continue }
        if (@(Get-ChildItem -LiteralPath $dir -Force).Count -ne 0) { continue }
        return $dir
    }
    Stop-Skript 'Nepodarilo sa vytvoriť nový prázdny priečinok pre zálohu. Nič sa neprepísalo.'
}
