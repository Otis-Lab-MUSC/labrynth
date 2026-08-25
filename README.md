# Labrynth — Application Shell

**Cross-platform control application for REACHER operant behavior experiments, with a browser interface and a terminal interface over the same rigs.**

[![Version](https://img.shields.io/badge/version-3.0.1--alpha.13-blue)](https://github.com/Otis-Lab-MUSC/labrynth/releases)
[![Language](https://img.shields.io/badge/python-3.10+-blue)](https://www.python.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-orange)](CHANGELOG.md)
[![Phoxel Workbench](https://img.shields.io/badge/Phoxel_Workbench-member-orange)](https://github.com/Otis-Lab-MUSC)

*Written by*: Joshua Boquiren

[![](https://img.shields.io/badge/@thejoshbq-grey?style=flat&logo=github)](https://github.com/thejoshbq)

---

## Overview

Labrynth is the application a researcher opens to run an operant behavior session. From one window it pairs with one or more REACHER machines — the rig at the bench and others across the lab network — uploads the paradigm firmware to each chamber, and configures the hardware for that run: levers and their reinforcement schedules, audio cues, infusion pumps, optogenetic laser, lick circuit, and microscope triggers.

Fixed-ratio, progressive-ratio, variable-interval, omission, and Pavlovian paradigms are set up from the same panels, with saved presets for the standard self-administration and extinction protocols. A running session streams live — infusions, lever presses, trial counts, and elapsed time update as they happen — and exports with its notes and full behavioral record for downstream analysis. The same control is available from a terminal interface for display-less hosts, such as a rig-mounted Raspberry Pi.

---

## Download

Prebuilt installers are attached to the [latest release](https://github.com/Otis-Lab-MUSC/labrynth/releases/latest).

| Platform | Download |
|---|---|
| Windows | [`.exe`](https://github.com/Otis-Lab-MUSC/labrynth/releases/latest) |
| macOS | [`.dmg`](https://github.com/Otis-Lab-MUSC/labrynth/releases/latest) |
| Linux | [`.deb` / `.AppImage`](https://github.com/Otis-Lab-MUSC/labrynth/releases/latest) |

---

## Getting Started

Installers cover normal use. To run from source instead:

```bash
git clone https://github.com/Otis-Lab-MUSC/labrynth.git
cd labrynth
pip install -e ".[cli]"
```

Reference documentation lives in [`docs/`](docs/); [CONTRIBUTING.md](CONTRIBUTING.md) covers the branching and versioning workflow, and [RELEASING.md](RELEASING.md) covers release channels and tagging.

---

## Architecture & Dependencies

| Component | Language | Framework / Libraries |
|---|---|---|
| Web interface | TypeScript | React 19, Zustand, Vite, Tailwind CSS, lucide-react |
| Terminal CLI | Python 3.10+ | prompt_toolkit, httpx, websockets |
| Application shell & packaging | Python 3.10+ | PyInstaller |
| Experiment backend | Python 3.10+ | [reacher](https://github.com/Otis-Lab-MUSC/reacher) (`reacher2p`), which also ships the Arduino firmware |

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contact

Joshua Boquiren — [thejoshbq@proton.me](mailto:thejoshbq@proton.me)

[GitHub: Otis-Lab-MUSC/labrynth](https://github.com/Otis-Lab-MUSC/labrynth)
