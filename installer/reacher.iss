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
AppName=REACHER
AppVersion={#VERSION_NUM}
AppVerName=REACHER {#VERSION_NUM}
AppPublisher=Otis Lab, MUSC
DefaultDirName={autopf}\REACHER
DefaultGroupName=REACHER
OutputDir=..\dist
OutputBaseFilename=REACHER-{#VERSION_NUM}-windows-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
WizardStyle=modern
UninstallDisplayIcon={app}\REACHER.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\REACHER\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\REACHER"; Filename: "{app}\REACHER.exe"
Name: "{group}\{cm:UninstallProgram,REACHER}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\REACHER"; Filename: "{app}\REACHER.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\REACHER.exe"; Description: "{cm:LaunchProgram,REACHER}"; Flags: nowait postinstall skipifsilent
