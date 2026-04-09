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
DefaultGroupName=Labrynth
OutputDir=..\dist
OutputBaseFilename=labrynth-{#VERSION_NUM}-windows-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
WizardStyle=modern
UninstallDisplayIcon={app}\Labrynth.exe
SetupIconFile=..\web\public\favicon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\Labrynth\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Labrynth"; Filename: "{app}\Labrynth.exe"; IconFilename: "{app}\Labrynth.exe"
Name: "{group}\{cm:UninstallProgram,Labrynth}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Labrynth"; Filename: "{app}\Labrynth.exe"; Tasks: desktopicon; IconFilename: "{app}\Labrynth.exe"

[Run]
Filename: "{app}\Labrynth.exe"; Description: "{cm:LaunchProgram,Labrynth}"; Flags: nowait postinstall skipifsilent
