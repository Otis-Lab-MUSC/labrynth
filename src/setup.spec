# -*- mode: python ; coding: utf-8 -*-

import sys

block_cipher = None

a = Analysis(
    ['dashboard/main.py'],  # Entry-point script
    pathex=['.'],  # Add current directory to path
    binaries=[],
    datas=[
        # Include external assets
        ('dashboard/utils/assets/*', 'assets'),
    ],
    hiddenimports=['panel', 'plotly', 'pkg_resources', 'requests', 'PIL._tkinter_finder', 'PIL.ImageTk'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='reacher-dashboard',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon='dashboard/utils/assets/reacher-app-icon.ico' if sys.platform != 'darwin' else 'dashboard/utils/assets/reacher-app-icon.icns',
)

if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        name='REACHER Dashboard.app',
        icon='dashboard/utils/assets/reacher-app-icon.icns',
        bundle_identifier='com.yourname.reacher-dashboard',  # Replace with your identifier
    )
else:
    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=True,
        upx_exclude=[],
        name='reacher-dashboard',
    )