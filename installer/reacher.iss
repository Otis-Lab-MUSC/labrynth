; Inno Setup script for REACHER Windows installer.
;
; Packages the PyInstaller dist\REACHER\ directory into a single .exe installer.
;
; Usage (from labrynth/ root):
;   iscc installer\reacher.iss
;
; The VERSION_NUM environment variable controls the version string.
; Falls back to "2.0.0" if unset.

#ifndef VERSION_NUM
  #define VERSION_NUM GetEnv("VERSION_NUM")
  #if VERSION_NUM == ""
    #define VERSION_NUM "2.0.0"
  #endif
#endif

[Setup]
AppId={{B7E3F1A2-9C4D-4E8B-A1F6-3D5E7C9B2A4F}
AppName=Labrynth
AppVersion={#VERSION_NUM}
AppVerName=Labrynth {#VERSION_NUM}
AppPublisher=Otis Lab, MUSC
DefaultDirName={autopf}\Labrynth
PrivilegesRequired=lowest
DefaultGroupName=Labrynth
OutputDir=..\dist
OutputBaseFilename=labrynth-{#VERSION_NUM}-windows-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
WizardStyle=modern
UninstallDisplayIcon={app}\labrynth-icon.ico
SetupIconFile=..\installer\icons\labrynth-icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\Labrynth\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\installer\icons\labrynth-icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Labrynth"; Filename: "{app}\Labrynth.exe"; IconFilename: "{app}\labrynth-icon.ico"
Name: "{group}\{cm:UninstallProgram,Labrynth}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Labrynth"; Filename: "{app}\Labrynth.exe"; Tasks: desktopicon; IconFilename: "{app}\labrynth-icon.ico"

[Run]
Filename: "{app}\Labrynth.exe"; Description: "{cm:LaunchProgram,Labrynth}"; Flags: nowait postinstall skipifsilent

[Code]
// Labrynth 3.0.0 installed for all users (Program Files, HKLM). This installer
// runs per-user under the same AppId, so Inno Setup would not see that copy and
// a second install would sit beside it. Remove it first; its uninstaller needs
// administrator rights, so Windows asks once. User data lives in ~/.reacher and
// is not touched by either uninstaller.
const
  MachineUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B7E3F1A2-9C4D-4E8B-A1F6-3D5E7C9B2A4F}_is1';
  UninstallWaitSteps = 120;
  UninstallWaitStepMs = 500;

function FindMachineUninstaller(var Uninstaller: String): Boolean;
begin
  Result := RegQueryStringValue(HKLM32, MachineUninstallKey, 'UninstallString', Uninstaller);
  if not Result then
    Result := RegQueryStringValue(HKLM64, MachineUninstallKey, 'UninstallString', Uninstaller);
  if Result then
    Uninstaller := RemoveQuotes(Uninstaller);
end;

function MachineInstallRemains(): Boolean;
var
  Ignored: String;
begin
  Result := FindMachineUninstaller(Ignored);
end;

function RemovalFailed(Reason: String): String;
begin
  Result := 'An older Labrynth installed for all users could not be removed (' + Reason + '). ' +
    'Uninstall it from Settings > Apps with an administrator account, then run this installer again.';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Uninstaller: String;
  ResultCode, Step: Integer;
begin
  Result := '';
  if not FindMachineUninstaller(Uninstaller) then
    Exit;
  if not FileExists(Uninstaller) then
  begin
    Log('All-users uninstall entry found but its uninstaller is missing: ' + Uninstaller);
    Exit;
  end;
  Log('Removing the all-users Labrynth install: ' + Uninstaller);
  if not ShellExec('runas', Uninstaller, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '',
                   SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := RemovalFailed(SysErrorMessage(ResultCode));
    Exit;
  end;
  Step := 0;
  while MachineInstallRemains() and (Step < UninstallWaitSteps) do
  begin
    Sleep(UninstallWaitStepMs);
    Step := Step + 1;
  end;
  if MachineInstallRemains() then
    Result := RemovalFailed('its uninstaller exited with code ' + IntToStr(ResultCode));
end;
