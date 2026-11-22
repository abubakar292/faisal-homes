@echo off
setlocal
title FAISAL HOMES - Installer
echo.
echo  ==========================================================
echo     FAISAL HOMES - One-click installer
echo  ==========================================================
echo  This window will install everything FAISAL HOMES needs.
echo  When Windows asks "Do you want to allow this app to make
echo  changes to your device?", click YES.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = '%~f0'; $s = [IO.File]::ReadAllText($f); $i = $s.IndexOf('#' + 'PS-INSTALLER-START'); & ([ScriptBlock]::Create($s.Substring($i))) -BatDir '%~dp0'"
echo.
echo Press any key to close this window.
pause >nul
exit /b
#PS-INSTALLER-START
# ---------------------------------------------------------------------------------------------
# FAISAL HOMES installer (Windows PowerShell 5.1+). Everything below runs inside PowerShell.
# What it does (nothing else on the PC is changed):
#   1. finds faisal-homes.zip and extracts a copy (the zip itself is never changed or deleted)
#   2. checks the project files
#   3. installs Node.js 22 if missing          (official signed installer, Windows asks permission)
#   4. installs PostgreSQL 16 if missing       (official signed installer, Windows asks permission)
#   5. copies the program to C:\FaisalHomes   (an existing installation is backed up first)
#   6. installs program components (npm)
#   7. creates a separate database user + database, writes .env (passwords stay on this PC)
#   8. creates the tables and makes the first backup
#   9. runs the automatic self-test on a separate, temporary test database
#  10. creates a Desktop shortcut, starts FAISAL HOMES and opens http://localhost:4000
# It does NOT change firewall, startup or other Windows settings, and does not delete files.
# ---------------------------------------------------------------------------------------------
param([string]$BatDir)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$AppDir = 'C:\FaisalHomes'
$AppPort = 4000
$DbUser = 'faisal_app'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $env:TEMP "faisal-homes-install-$Stamp.log"
$Notes = New-Object System.Collections.ArrayList
$script:Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
try { Start-Transcript -Path $LogFile -Force | Out-Null } catch {}

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host $Text -ForegroundColor $Color }
function Step([int]$N, [string]$Text) { Write-Host ''; Write-Host ('[{0}/10] {1}' -f $N, $Text) -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "      OK   $Text" -ForegroundColor Green }
function Note([string]$Text) { [void]$Notes.Add($Text); Write-Host "      NOTE $Text" -ForegroundColor Yellow }
function Stop-Install([string]$Text) {
  Write-Host ''
  Write-Host '  INSTALLATION STOPPED' -ForegroundColor Red
  Write-Host "  $Text" -ForegroundColor Red
  Write-Host ''
  Write-Host '  Nothing was deleted. You can run the installer again after fixing the problem.' -ForegroundColor Yellow
  Write-Host "  A log of this attempt (no passwords) is saved at: $LogFile" -ForegroundColor Yellow
  try { Stop-Transcript | Out-Null } catch {}
  exit 1
}

function New-Secret([int]$Length = 24) {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $sb = New-Object System.Text.StringBuilder
  foreach ($b in $bytes) { [void]$sb.Append($chars[$b % $chars.Length]) }
  return $sb.ToString()
}

function Read-Secret([string]$Prompt) {
  $sec = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

# Run a program and return its exit code (and output when -Quiet). Never throws on program errors.
function Invoke-Native([string]$Exe, [string[]]$Arguments, [switch]$Quiet, [string]$InputText) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = ''
  try {
    if ($InputText) {
      $out = ($InputText | & $Exe @Arguments 2>&1 | Out-String)
    } elseif ($Quiet) {
      $out = (& $Exe @Arguments 2>&1 | Out-String)
    } else {
      & $Exe @Arguments 2>&1 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
    }
    $code = $LASTEXITCODE
  } catch {
    $out = $_.Exception.Message
    $code = 9999
  } finally {
    $ErrorActionPreference = $old
  }
  return @{ Code = $code; Output = $out }
}

function Assert-Signed([string]$File) {
  $sig = Get-AuthenticodeSignature -FilePath $File
  if ($sig.Status -ne 'Valid') { Stop-Install "The downloaded file $File has no valid digital signature ($($sig.Status)). For safety it was not run." }
  Ok ('Digital signature checked: ' + $sig.SignerCertificate.Subject.Split(',')[0])
}

function Start-Elevated([string]$File, [string]$ArgumentText, [string]$What) {
  Say "      Windows will now ask for permission to install $What. Please click YES." 'Yellow'
  try {
    $p = Start-Process -FilePath $File -ArgumentList $ArgumentText -Verb RunAs -Wait -PassThru
    return $p.ExitCode
  } catch {
    Stop-Install "Permission was not given to install $What. Run the installer again and click YES when Windows asks."
  }
}

# ---------------------------------------------------------------- Node.js
function Get-NodeExe {
  $c = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  if (Test-Path $p) { return $p }
  return $null
}
function Get-NodeMajor {
  $exe = Get-NodeExe
  if (-not $exe) { return 0 }
  $r = Invoke-Native $exe @('-v') -Quiet
  if ($r.Output -match 'v(\d+)\.') { return [int]$Matches[1] }
  return 0
}
function Install-Node {
  if ($script:Winget) {
    foreach ($id in @('OpenJS.NodeJS.22', 'OpenJS.NodeJS.LTS')) {
      Say "      Installing Node.js ($id) with Windows Package Manager. Windows may ask permission: click YES." 'Yellow'
      [void](Invoke-Native $script:Winget.Source @('install', '--id', $id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements'))
      Update-PathFromRegistry
      if ((Get-NodeMajor) -ge 20) { return }
    }
    Note 'Windows Package Manager could not install Node.js, using the official download instead.'
  }
  Say '      Downloading Node.js 22 from nodejs.org ...'
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
  $rel = $index | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1
  if (-not $rel) { Stop-Install 'Could not find Node.js 22 on nodejs.org. Check the internet connection.' }
  $msi = Join-Path $env:TEMP "node-$($rel.version)-x64.msi"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$($rel.version)/node-$($rel.version)-x64.msi" -OutFile $msi -UseBasicParsing
  Assert-Signed $msi
  $code = Start-Elevated 'msiexec.exe' "/i `"$msi`" /qn /norestart" 'Node.js'
  if ($code -ne 0 -and $code -ne 3010) { Stop-Install "The Node.js installer reported error code $code." }
  Update-PathFromRegistry
}

# ---------------------------------------------------------------- PostgreSQL
function Find-Postgres {
  $best = $null
  $root = Join-Path $env:ProgramFiles 'PostgreSQL'
  if (Test-Path $root) {
    foreach ($d in (Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue)) {
      $bin = Join-Path $d.FullName 'bin'
      if (-not (Test-Path (Join-Path $bin 'psql.exe'))) { continue }
      if ($d.Name -notmatch '^(\d+)') { continue }
      $major = [int]$Matches[1]
      if (-not $best -or $major -gt $best.Major) { $best = [pscustomobject]@{ Major = $major; Dir = $d.FullName; Bin = $bin } }
    }
  }
  return $best
}
function Test-PgReady($Pg, [int]$Port) {
  $r = Invoke-Native (Join-Path $Pg.Bin 'pg_isready.exe') @('-h', 'localhost', '-p', "$Port") -Quiet
  return ($r.Code -eq 0)
}
function Find-PgPort($Pg) {
  $conf = Join-Path $Pg.Dir 'data\postgresql.conf'
  try {
    if (Test-Path $conf) {
      $line = Select-String -Path $conf -Pattern '^\s*port\s*=\s*(\d+)' | Select-Object -First 1
      if ($line) { return [int]$line.Matches[0].Groups[1].Value }
    }
  } catch {}
  foreach ($p in @(5432, 5433, 5434, 5435)) { if (Test-PgReady $Pg $p) { return $p } }
  return 5432
}
function Wait-PgReady($Pg, [int]$Port, [int]$Seconds = 180) {
  for ($i = 0; $i -lt $Seconds; $i += 3) {
    if (Test-PgReady $Pg $Port) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}
function Start-PgService {
  $svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($svc -and $svc.Status -ne 'Running') {
    [void](Start-Elevated 'powershell.exe' "-NoProfile -Command Start-Service -Name '$($svc.Name)'" 'the PostgreSQL database service (start it)')
  }
}
function Invoke-Psql($Pg, [int]$Port, [string]$User, [string]$Password, [string]$Database, [string]$Sql, [switch]$Scalar) {
  $env:PGPASSWORD = $Password
  try {
    if ($Scalar) {
      return Invoke-Native (Join-Path $Pg.Bin 'psql.exe') @('-h', 'localhost', '-p', "$Port", '-U', $User, '-d', $Database, '-w', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', $Sql) -Quiet
    }
    return Invoke-Native (Join-Path $Pg.Bin 'psql.exe') @('-h', 'localhost', '-p', "$Port", '-U', $User, '-d', $Database, '-w', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-') -InputText $Sql
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}
function Test-PgLogin($Pg, [int]$Port, [string]$User, [string]$Password, [string]$Database) {
  $r = Invoke-Psql $Pg $Port $User $Password $Database 'SELECT 1' -Scalar
  return ($r.Code -eq 0)
}
function Install-Postgres([string]$SuperPassword, [int]$Port) {
  $pgArgs = "--mode unattended --unattendedmodeui none --superpassword $SuperPassword --serverport $Port"
  if ($script:Winget) {
    Say '      Installing PostgreSQL 16 with Windows Package Manager. This can take 5 minutes.' 'Yellow'
    Say '      Windows will ask for permission: click YES.' 'Yellow'
    [void](Invoke-Native $script:Winget.Source @('install', '--id', 'PostgreSQL.PostgreSQL.16', '-e', '--accept-package-agreements', '--accept-source-agreements', '--override', $pgArgs))
    $pg = Find-Postgres
    if ($pg -and $pg.Major -ge 16) { return $pg }
    Note 'Windows Package Manager could not install PostgreSQL, using the official download instead.'
  }
  $exe = $null
  foreach ($v in @('16.14-2', '16.13-1', '16.12-1', '16.10-1', '16.9-1', '16.4-1')) {
    $target = Join-Path $env:TEMP "postgresql-$v-windows-x64.exe"
    try {
      Say "      Downloading PostgreSQL $v from the official EDB server ..."
      Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-$v-windows-x64.exe" -OutFile $target -UseBasicParsing
      $exe = $target
      break
    } catch { continue }
  }
  if (-not $exe) { Stop-Install 'Could not download PostgreSQL 16. Check the internet connection and try again.' }
  Assert-Signed $exe
  Say '      Installing PostgreSQL 16. This can take 5 minutes.' 'Yellow'
  $code = Start-Elevated $exe $pgArgs 'PostgreSQL 16'
  if ($code -ne 0) { Stop-Install "The PostgreSQL installer reported error code $code." }
  return (Find-Postgres)
}

function Test-AppHealth {
  try { $r = Invoke-WebRequest -Uri "http://localhost:$AppPort/api/health" -UseBasicParsing -TimeoutSec 3; return ($r.StatusCode -eq 200) } catch { return $false }
}
# Limit a file/folder to: you, SYSTEM and Administrators.
function Protect-File([string]$Path, [switch]$Folder) {
  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $f = ''
  if ($Folder) { $f = '(OI)(CI)' }
  [void](Invoke-Native 'icacls.exe' @($Path, '/inheritance:r', '/grant:r', "${me}:$($f)F", "*S-1-5-18:$($f)F", "*S-1-5-32-544:$($f)F") -Quiet)
}

# =============================================================================================
Say ''
Say '  FAISAL HOMES installer started.' 'White'
Say "  Program folder: $AppDir   (log: $LogFile)" 'DarkGray'

# ---------------------------------------------------------------- 1. find + extract
Step 1 'Finding and extracting faisal-homes.zip'
$BatDir = ($BatDir + '').TrimEnd('\')
$Source = $null
$ZipFile = $null
if ($BatDir -and (Test-Path (Join-Path $BatDir 'server\package.json'))) {
  $Source = $BatDir
  Ok "Using the program files in $Source"
} else {
  $dirs = @($BatDir, (Join-Path $env:USERPROFILE 'Downloads'), [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments')) |
    Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  $zips = foreach ($d in $dirs) { Get-ChildItem -Path $d -Filter 'faisal-homes*.zip' -File -ErrorAction SilentlyContinue }
  $ZipFile = $zips | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $ZipFile) { Stop-Install 'faisal-homes.zip was not found. Put faisal-homes.zip in the same folder as this installer (for example Downloads) and run it again.' }
  Ok "Found $($ZipFile.FullName) ($([math]::Round($ZipFile.Length / 1MB, 2)) MB, $($ZipFile.LastWriteTime))"
  $extract = Join-Path $env:TEMP "faisal-homes-extract-$Stamp"
  try { Expand-Archive -LiteralPath $ZipFile.FullName -DestinationPath $extract -Force } catch { Stop-Install "The zip file could not be opened. It may be damaged; download it again. ($($_.Exception.Message))" }
  $Source = Join-Path $extract 'faisal-homes'
  if (-not (Test-Path $Source)) { $Source = $extract }
  Get-ChildItem -Path $Source -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
  Ok "Extracted a copy to $Source (the original zip was not changed)"
}

# ---------------------------------------------------------------- 2. check files
Step 2 'Checking the project files'
foreach ($f in @('server\package.json', 'server\package-lock.json', 'server\src\index.js', 'server\src\db\migrations\001_init.sql', 'client\dist\index.html', 'start-windows.bat', 'README.md', 'DEPLOYMENT.md')) {
  if (-not (Test-Path (Join-Path $Source $f))) { Stop-Install "The program files are incomplete: $f is missing. Download faisal-homes.zip again." }
}
$pkg = Get-Content (Join-Path $Source 'package.json') -Raw | ConvertFrom-Json
Ok "FAISAL HOMES version $($pkg.version): server, database migrations, web interface and documentation are present"
$sourceIsApp = $false
try { $sourceIsApp = ((Resolve-Path $Source).Path.TrimEnd('\') -ieq $AppDir) } catch {}
if (-not $sourceIsApp -and (Test-Path $AppDir) -and -not (Test-Path (Join-Path $AppDir 'server\package.json'))) {
  if (Get-ChildItem -Path $AppDir -Force | Where-Object { $_.Name -ne 'secrets' }) {
    Stop-Install "The folder $AppDir already exists and contains other files. To protect your files the installer will not mix them. Rename that folder and run the installer again."
  }
}

# ---------------------------------------------------------------- 3. Node.js
Step 3 'Checking Node.js'
Update-PathFromRegistry
$nodeMajor = Get-NodeMajor
if ($nodeMajor -ge 20) {
  Ok "Node.js $nodeMajor is already installed"
} else {
  if ($nodeMajor -gt 0) { Say "      Node.js $nodeMajor is too old; installing Node.js 22." }
  Install-Node
  $nodeMajor = Get-NodeMajor
  if ($nodeMajor -lt 20) { Stop-Install 'Node.js could not be installed. Restart the computer and run the installer again.' }
  Ok "Node.js $nodeMajor installed"
}
$NodeExe = Get-NodeExe
$NpmCmd = Join-Path (Split-Path $NodeExe -Parent) 'npm.cmd'
if (-not (Test-Path $NpmCmd)) { $c = Get-Command npm.cmd -ErrorAction SilentlyContinue; if ($c) { $NpmCmd = $c.Source } else { Stop-Install 'npm (part of Node.js) was not found.' } }

# ---------------------------------------------------------------- 4. PostgreSQL
Step 4 'Checking PostgreSQL'
$Pg = Find-Postgres
$SuperPassword = $null
$SuperPasswordFile = $null
if ($Pg -and $Pg.Major -ge 14) {
  $PgPort = Find-PgPort $Pg
  if (-not (Test-PgReady $Pg $PgPort)) { Start-PgService; [void](Wait-PgReady $Pg $PgPort 60) }
  if (-not (Test-PgReady $Pg $PgPort)) { Stop-Install "PostgreSQL $($Pg.Major) is installed but is not running. Open Windows Services, start the 'postgresql' service, and run the installer again." }
  Ok "PostgreSQL $($Pg.Major) is already installed and running (port $PgPort)"
} else {
  if ($Pg) { Say "      PostgreSQL $($Pg.Major) is too old for FAISAL HOMES; installing PostgreSQL 16 alongside it (your old one is not touched)." }
  $PgPort = 5432
  $busy = $null
  try { $busy = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue } catch {}
  if ($busy) { $PgPort = 5433 }
  $SuperPassword = New-Secret 20
  # Save the database administrator password on THIS PC only (folder readable only by you), before installing.
  $secretDir = Join-Path $AppDir 'secrets'
  New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
  Protect-File $secretDir -Folder
  $SuperPasswordFile = Join-Path $secretDir 'postgres-admin-password.txt'
  @(
    'FAISAL HOMES - PostgreSQL database administrator password',
    "Created: $(Get-Date)",
    '',
    "User: postgres    Port: $PgPort",
    "Password: $SuperPassword",
    '',
    'Keep this private. Write it on paper and keep it in a safe place.',
    'FAISAL HOMES itself uses its own separate database user (see the .env file).'
  ) | Set-Content -Path $SuperPasswordFile -Encoding ASCII
  Protect-File $SuperPasswordFile
  $Pg = Install-Postgres $SuperPassword $PgPort
  if (-not $Pg -or $Pg.Major -lt 16) { Stop-Install 'PostgreSQL 16 could not be installed.' }
  if (-not (Wait-PgReady $Pg $PgPort 180)) { Start-PgService; if (-not (Wait-PgReady $Pg $PgPort 60)) { Stop-Install 'PostgreSQL was installed but did not start. Restart the computer and run the installer again.' } }
  Ok "PostgreSQL $($Pg.Major) installed and running (port $PgPort)"
}

# ---------------------------------------------------------------- 5. copy program
Step 5 "Installing the program files in $AppDir"
$sameDir = $false
try { $sameDir = ((Resolve-Path $Source).Path.TrimEnd('\') -ieq $AppDir) } catch {}
$isUpgrade = Test-Path (Join-Path $AppDir 'server\package.json')
if ($sameDir) {
  Ok 'The program is already in its final folder'
} elseif ($isUpgrade) {
  Say '      An earlier FAISAL HOMES installation was found. It will be backed up first.'
  while (Test-AppHealth) {
    Say '      FAISAL HOMES is running. Please close the black "FAISAL HOMES - Server" window, then press Enter here.' 'Yellow'
    [void](Read-Host)
  }
  if ((Test-Path (Join-Path $AppDir '.env')) -and (Test-Path (Join-Path $AppDir 'server\node_modules'))) {
    $r = Invoke-Native $NodeExe @((Join-Path $AppDir 'server\src\db\backup-cli.js'))
    if ($r.Code -eq 0) { Ok 'Database backup made before upgrading' } else { Note 'Could not make a database backup before upgrading (see messages above).' }
  }
  $prev = "$AppDir-previous-$Stamp"
  [void](Invoke-Native 'robocopy.exe' @($AppDir, $prev, '/E', '/XD', 'node_modules', 'storage', 'secrets', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -Quiet)
  Ok "Previous program files copied to $prev"
  $r = Invoke-Native 'robocopy.exe' @($Source, $AppDir, '/E', '/XD', 'storage', 'secrets', 'node_modules', '/XF', '.env', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -Quiet
  if ($r.Code -ge 8) { Stop-Install "Copying the new program files failed (robocopy code $($r.Code))." }
  Ok 'New program files copied (your .env, documents and backups were kept)'
} else {
  if ((Test-Path $AppDir) -and (Get-ChildItem -Path $AppDir -Force | Where-Object { $_.Name -ne 'secrets' })) {
    Stop-Install "The folder $AppDir already exists and contains other files. To protect your files the installer will not mix them. Rename that folder and run the installer again."
  }
  New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
  $r = Invoke-Native 'robocopy.exe' @($Source, $AppDir, '/E', '/XD', 'node_modules', 'storage', '/XF', '.env', '/NFL', '/NDL', '/NJH', '/NJS', '/NP') -Quiet
  if ($r.Code -ge 8) { Stop-Install "Copying the program files failed (robocopy code $($r.Code))." }
  Ok "Program copied to $AppDir"
}
if ($ZipFile) {
  $keep = Join-Path $AppDir 'setup-files'
  New-Item -ItemType Directory -Path $keep -Force | Out-Null
  Copy-Item -LiteralPath $ZipFile.FullName -Destination (Join-Path $keep $ZipFile.Name) -Force
  Ok "A copy of the original zip is kept in $keep"
}

# ---------------------------------------------------------------- 6. npm
Step 6 'Installing program components (needs internet, 1-3 minutes)'
Push-Location $AppDir
$r = Invoke-Native $NpmCmd @('ci', '--prefix', 'server', '--omit=dev', '--no-audit', '--no-fund')
if ($r.Code -ne 0) {
  Say '      Retrying with a normal install ...' 'Yellow'
  $r = Invoke-Native $NpmCmd @('install', '--prefix', 'server', '--omit=dev', '--no-audit', '--no-fund')
  if ($r.Code -ne 0) { Pop-Location; Stop-Install 'The program components could not be downloaded. Check the internet connection and run the installer again.' }
}
Pop-Location
Ok 'Program components installed'

# ---------------------------------------------------------------- 7. database + .env
Step 7 'Setting up the database and settings file (.env)'
$EnvFile = Join-Path $AppDir '.env'
$DbName = $null
$AppPassword = $null
if (Test-Path $EnvFile) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($line -match 'postgres(?:ql)?://([^:@/]+):([^@/]*)@[^:/]+:(\d+)/([A-Za-z0-9_]+)') {
    if (Test-PgLogin $Pg ([int]$Matches[3]) $Matches[1] ([uri]::UnescapeDataString($Matches[2])) $Matches[4]) {
      $DbUser = $Matches[1]; $AppPassword = [uri]::UnescapeDataString($Matches[2]); $PgPort = [int]$Matches[3]; $DbName = $Matches[4]
      Ok "Existing settings file works (database $DbName). It was kept."
    }
  }
  if (-not $DbName) {
    Copy-Item $EnvFile "$EnvFile.backup-$Stamp"
    Note "The existing .env did not work; it was saved as .env.backup-$Stamp and a new one is being made."
  }
}
if (-not $DbName) {
  if (-not $SuperPassword) {
    # A previous run of this installer may have saved the administrator password on this PC.
    $savedFile = Join-Path $AppDir 'secrets\postgres-admin-password.txt'
    if (Test-Path $savedFile) {
      $saved = (Get-Content $savedFile | Where-Object { $_ -match '^Password: ' } | Select-Object -First 1)
      if ($saved) {
        $savedPw = $saved.Substring(10).Trim()
        if (Test-PgLogin $Pg $PgPort 'postgres' $savedPw 'postgres') { $SuperPassword = $savedPw; Ok 'Used the database administrator password saved by the earlier installation' }
      }
    }
  }
  if (-not $SuperPassword) {
    if (Test-PgLogin $Pg $PgPort 'postgres' 'postgres' 'postgres') {
      $SuperPassword = 'postgres'
      Note "Your PostgreSQL administrator password is still the default 'postgres'. Consider changing it later."
    } else {
      Say ''
      Say '      PostgreSQL was already installed on this PC, so the installer needs its administrator password' 'Yellow'
      Say '      (the password chosen when PostgreSQL was installed, for the user "postgres").' 'Yellow'
      Say '      It is used only now, on this PC, and is not saved or sent anywhere.' 'Yellow'
      for ($try = 1; $try -le 3 -and -not $SuperPassword; $try++) {
        $p = Read-Secret '      PostgreSQL password (typing is hidden)'
        if (Test-PgLogin $Pg $PgPort 'postgres' $p 'postgres') { $SuperPassword = $p } else { Say '      That password did not work.' 'Red' }
      }
      if (-not $SuperPassword) { Stop-Install 'The PostgreSQL administrator password was not accepted. If you do not know it, ask the person who installed PostgreSQL on this PC.' }
    }
  }
  $AppPassword = New-Secret 24
  $roleSql = @'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '__USER__') THEN
    CREATE ROLE __USER__ LOGIN CREATEDB PASSWORD '__PW__';
  ELSE
    ALTER ROLE __USER__ WITH LOGIN CREATEDB PASSWORD '__PW__';
  END IF;
END
$$;
'@
  $r = Invoke-Psql $Pg $PgPort 'postgres' $SuperPassword 'postgres' ($roleSql.Replace('__USER__', $DbUser).Replace('__PW__', $AppPassword))
  if ($r.Code -ne 0) { Stop-Install ('Could not create the database user: ' + ($r.Output + '').Replace($AppPassword, '********')) }
  Ok "Database user '$DbUser' ready (it has its own random password, separate from the administrator)"
  foreach ($candidate in @('faisal_homes', 'faisal_homes_office')) {
    $q = Invoke-Psql $Pg $PgPort 'postgres' $SuperPassword 'postgres' "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$candidate'" -Scalar
    $owner = ($q.Output + '').Trim()
    if (-not $owner) {
      $r = Invoke-Psql $Pg $PgPort 'postgres' $SuperPassword 'postgres' "CREATE DATABASE $candidate OWNER $DbUser ENCODING 'UTF8' TEMPLATE template0;"
      if ($r.Code -ne 0) { Stop-Install "Could not create the database: $($r.Output)" }
      $DbName = $candidate
      Ok "Database '$DbName' created"
      break
    }
    if ($owner -eq $DbUser) { $DbName = $candidate; Ok "Database '$DbName' already exists and belongs to FAISAL HOMES"; break }
    Note "A database named '$candidate' already exists and belongs to '$owner'. It was not touched."
  }
  if (-not $DbName) { Stop-Install 'No free database name was found.' }
  @(
    '# FAISAL HOMES settings (created by the installer). Keep this file private.',
    "DATABASE_URL=postgres://${DbUser}:$AppPassword@localhost:$PgPort/$DbName",
    "PORT=$AppPort",
    '# 127.0.0.1 = only this PC can open FAISAL HOMES. Use 0.0.0.0 to allow other office PCs (see DEPLOYMENT.md).',
    'HOST=127.0.0.1',
    'APP_TIMEZONE=Asia/Karachi',
    'STORAGE_DIR=storage',
    "PG_BIN_DIR=$($Pg.Bin)",
    '# Optional second copy of every backup, e.g. a Google Drive or USB folder:',
    '# BACKUP_COPY_DIR=G:\My Drive\FaisalHomesBackups',
    'COOKIE_SECURE=false',
    'MAX_UPLOAD_MB=10'
  ) | Set-Content -Path $EnvFile -Encoding ASCII
  Protect-File $EnvFile
  Ok 'Settings file .env written (readable only by your Windows user)'
}

# ---------------------------------------------------------------- 8. tables + first backup
Step 8 'Creating the database tables and the first backup'
$r = Invoke-Native $NodeExe @((Join-Path $AppDir 'server\src\db\migrate.js'))
if ($r.Code -ne 0) { Stop-Install 'Creating the database tables failed (see the messages above).' }
Ok 'Database tables are ready'
$r = Invoke-Native $NodeExe @((Join-Path $AppDir 'server\src\db\backup-cli.js'))
if ($r.Code -eq 0) { Ok "First backup saved in $AppDir\storage\backups" } else { Note 'The first backup could not be made (see messages above). You can make one later in Backup & Restore.' }

# ---------------------------------------------------------------- 9. self-test
Step 9 'Running the automatic self-test (about 1-2 minutes)'
Say '      The test uses a separate temporary database with made-up data. Your real database is not used.'
$TestDb = 'faisal_homes_selftest'
$env:TEST_DATABASE_URL = "postgres://${DbUser}:$AppPassword@localhost:$PgPort/$TestDb"
$env:PG_BIN_DIR = $Pg.Bin
Push-Location $AppDir
$t = Invoke-Native $NpmCmd @('test', '--prefix', 'server') -Quiet
Pop-Location
Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
$testLog = Join-Path $AppDir "selftest-$Stamp.txt"
$t.Output | Set-Content -Path $testLog -Encoding UTF8
[void](Invoke-Psql $Pg $PgPort $DbUser $AppPassword 'postgres' "DROP DATABASE IF EXISTS $TestDb" -Scalar)
[void](Invoke-Psql $Pg $PgPort $DbUser $AppPassword 'postgres' "DROP DATABASE IF EXISTS ${TestDb}_land" -Scalar)
$passed = 0; $failed = -1
if ($t.Output -match '(?m)\bpass (\d+)\s*$') { $passed = [int]$Matches[1] }
if ($t.Output -match '(?m)\bfail (\d+)\s*$') { $failed = [int]$Matches[1] }
$SelfTestOk = ($failed -eq 0 -and $passed -gt 0)
if ($SelfTestOk) {
  Ok "Self-test passed: $passed of $passed checks (login, plots, customers, bookings, installments, payments, receipts, transfers, reports, backup/restore, land purchase and land payments, database upgrade). Temporary test database removed."
} else {
  Note "Self-test: $passed passed, $failed failed. Details saved in $testLog. FAISAL HOMES will still be started so you can look at it."
}

# ---------------------------------------------------------------- 10. shortcut + start
Step 10 'Starting FAISAL HOMES'
try {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'FAISAL HOMES.lnk'))
  $lnk.TargetPath = Join-Path $AppDir 'start-windows.bat'
  $lnk.WorkingDirectory = $AppDir
  $ico = Join-Path $AppDir 'client\dist\faisal-homes.ico'
  if (Test-Path $ico) { $lnk.IconLocation = $ico }
  $lnk.Description = 'Start FAISAL HOMES'
  $lnk.Save()
  Ok 'Desktop shortcut "FAISAL HOMES" created'
} catch { Note 'The Desktop shortcut could not be created. Start the program with C:\FaisalHomes\start-windows.bat.' }

$startedByUs = $false
if (-not (Test-AppHealth)) {
  Start-Process -FilePath (Join-Path $AppDir 'start-windows.bat') -WorkingDirectory $AppDir
  $startedByUs = $true
}
$up = $false
for ($i = 0; $i -lt 60; $i++) { if (Test-AppHealth) { $up = $true; break }; Start-Sleep -Seconds 1 }
if (-not $up) { Stop-Install 'FAISAL HOMES did not start. Look at the black "FAISAL HOMES - Server" window for the reason.' }
$page = Invoke-WebRequest -Uri "http://localhost:$AppPort/" -UseBasicParsing -TimeoutSec 10
if ($page.Content -notmatch 'FAISAL HOMES') { Stop-Install 'The server started but the web interface did not load.' }
$status = Invoke-RestMethod -Uri "http://localhost:$AppPort/api/auth/setup-status" -UseBasicParsing
Ok "FAISAL HOMES is running at http://localhost:$AppPort (web page and database answered)"

Copy-Item $LogFile (Join-Path $AppDir "install-log-$Stamp.txt") -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Green
if ($SelfTestOk) { Write-Host '     FAISAL HOMES IS INSTALLED AND RUNNING' -ForegroundColor Green } else { Write-Host '     FAISAL HOMES IS RUNNING (self-test reported problems)' -ForegroundColor Yellow }
Write-Host '  ==========================================================' -ForegroundColor Green
Say "  Open it any time with the Desktop shortcut 'FAISAL HOMES' or http://localhost:$AppPort" 'White'
Say "  Program folder : $AppDir" 'White'
Say "  Database       : PostgreSQL $($Pg.Major), database '$DbName' (port $PgPort)" 'White'
Say "  Backups        : $AppDir\storage\backups (automatic every night, plus at start-up if missed)" 'White'
if ($SuperPasswordFile) { Say "  DB admin password saved ONLY on this PC: $SuperPasswordFile  (write it on paper)" 'Yellow' }
foreach ($n in $Notes) { Say "  Note: $n" 'Yellow' }
Write-Host ''
if ($status.needsSetup) {
  Say '  NEXT STEP: your browser shows "Create administrator".' 'Cyan'
  Say '    1. Type your full name, a username (for example: faisal) and a strong password.' 'Cyan'
  Say '    2. Click "Create & sign in". That is your FAISAL HOMES admin account.' 'Cyan'
} else {
  Say '  Your administrator account already exists. Sign in with it in the browser.' 'Cyan'
}
Say '  Keep the black "FAISAL HOMES - Server" window open while you work. You may close THIS window.' 'White'
if (-not $startedByUs) { Start-Process "http://localhost:$AppPort" }
try { Stop-Transcript | Out-Null } catch {}
