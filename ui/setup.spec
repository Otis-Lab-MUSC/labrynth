# -*- mode: python ; coding: utf-8 -*-

import sys
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

a = Analysis(
    ['src/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('src/assets/*', 'assets'),
    ],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if sys.platform == 'darwin':
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name='labrynth',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        icon='src/assets/labrynth-icon.icns',
    )
    app = BUNDLE(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        name='Labrynth.app',
        icon='src/assets/labrynth-icon.icns',
        bundle_identifier='com.thejoshbq.labrynth',
    )
else:
    try:
        exe = EXE(
            pyz,
            a.scripts,
            [],
            exclude_binaries=True,
            name='labrynth',
            debug=False,
            bootloader_ignore_signals=False,
            strip=False,
            upx=True,
            console=False,
            icon='src/assets/labrynth-icon.ico',
        )
    except:
        exe = EXE(
            pyz,
            a.scripts,
            [],
            exclude_binaries=True,
            name='labrynth',
            debug=False,
            bootloader_ignore_signals=False,
            strip=False,
            upx=True,
            console=False,
            icon='src/assets/labrynth-icon.png',
        )
    finally:
        coll = COLLECT(
            exe,
            a.binaries,
            a.zipfiles,
            a.datas,
            strip=False,
            upx=True,
            upx_exclude=[],
            name='labrynth',
        )