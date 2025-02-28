; setup.iss
; Inno Setup script for REACHER Dashboard

[Setup]
; Basic metadata about the application
AppName=REACHER Dashboard
AppVersion=1.0
AppPublisher=Joshua Boquiren

; Installation directory (defaults to Program Files)
DefaultDirName={autopf}\REACHER Dashboard
DefaultGroupName=REACHER Dashboard
OutputBaseFilename=reacher-dashboard-1.0-x64
Compression=lzma
SolidCompression=yes
SetupIconFile=dashboard\utils\assets\reacher-app-icon.ico  ; Corrected path

; Optional: Uncomment to allow user to change install directory
; DisableDirPage=no

; Optional: License file (if you have one)
; LicenseFile=..\LICENSE.txt

[Files]
; Include all files from PyInstaller output
Source: "dist\reacher-dashboard\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs  ; Corrected path

[Icons]
; Start menu shortcut
Name: "{group}\REACHER Dashboard"; Filename: "{app}\reacher-dashboard.exe"

; Optional desktop icon (uncomment if desired)
; Name: "{autodesktop}\REACHER Dashboard"; Filename: "{app}\reacher-dashboard.exe"; Tasks: desktopicon

[Tasks]
; Optional: Let user choose to create a desktop icon
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
; Optional: Launch the app after installation
Filename: "{app}\reacher-dashboard.exe"; Description: "{cm:LaunchProgram,REACHER Dashboard}"; Flags: nowait postinstall skipifsilent

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"