import matplotlib
matplotlib.use('QtAgg')
import panel as pn
from reacher.interface.interface import Interface as WiredInterface
from reacher.remote.interface import Interface as WirelessInterface
import sys
import os
import multiprocessing
from typing import Any, Optional
from PySide6.QtWidgets import QApplication, QMainWindow, QLabel, QMessageBox, QPushButton, QVBoxLayout, QWidget
from PySide6.QtGui import QIcon
from PySide6.QtCore import Qt
import webbrowser

pn.extension('plotly')

# UI Components
box_name_TextInput: pn.widgets.TextInput = pn.widgets.TextInput(placeholder="Enter a box name")
make_new_local_instance_tab_button: pn.widgets.Button = pn.widgets.Button(name="New wired session")
make_new_network_instance_tab_button: pn.widgets.Button = pn.widgets.Button(name="New wireless session (BETA)")

start_area: pn.Column = pn.Column(
    pn.pane.Markdown("## Create a session"),
    pn.Row(box_name_TextInput, pn.Column(
        make_new_local_instance_tab_button,
        make_new_network_instance_tab_button),
    )
)

# Asset handling
if getattr(sys, 'frozen', False):  # Packaged (frozen) environment
    assets_dir: str = os.path.join(sys._MEIPASS, 'assets')
else:  # Development environment
    assets_dir: str = os.path.join('src', 'assets')

icon_path: str = os.path.join(assets_dir, 'labrynth-icon.png')

if not os.path.isfile(icon_path):
    print(f"Warning: Icon file not found at {icon_path}. Proceeding without custom banner.")

banner: pn.pane.PNG = pn.pane.PNG(os.path.join(assets_dir, 'labrynth-banner-wider.png'), width=600)
instructions: pn.pane.Markdown = pn.pane.Markdown(
    """
    # Setting Up a Session

    Welcome to the Labrynth! Follow these steps to set up and run your experiment session:

    ## Step 1: Create a New Session
    1. In the "Create a session" area, enter a unique name for your session (e.g., "Experiment_001").
    2. Click **"New local session"** to create a tabbed dashboard for your session.

    ## Step 2: Connect to the Microcontroller
    1. Navigate to the **Home Tab**.
    2. Click **"Search Microcontrollers"** to display a list of available COM ports.
    3. Select the COM port corresponding to your Arduino.
    4. Click **"Connect"** to establish a serial connection with the microcontroller.

    ## Step 3: Configure the Experiment
    Go to the **Program Tab** to define your experiment parameters:
    - **Select Hardware**: Choose the components you’ll use (e.g., levers, pumps, cues).
    - **Set Limits**: Specify constraints such as session time or infusion counts.
    - **File Configuration**: Name your data file and select a save location on your computer.

    ## Step 4: Adjust Hardware Settings
    In the **Hardware Tab**, fine-tune each component:
    - **Arm Devices**: Toggle components on or off (e.g., arm levers, disarm lasers).
    - **Set Parameters**: Adjust settings like cue frequency, pump speed, or laser duration.

    ## Step 5: Set Timing Parameters
    Visit the **Schedule Tab** to configure timing details:
    - **Timeouts**: Define durations for timeouts after specific actions.
    - **Ratios**: Set up fixed or progressive ratios based on your experiment design.

    ## Step 6: Run the Experiment
    1. Switch to the **Monitor Tab**.
    2. Click **"Start"** to launch the experiment session.
    3. Use **"Pause"** or **"Stop"** to control the session as needed.
    4. Observe real-time data and visualizations during the run.

    ## Step 7: Export Data
    1. Once the experiment is complete, click **"Export data"** in the **Monitor Tab**.
    2. Save your results as CSV files for further analysis.
    """
)

tab_1: pn.Column = pn.Column(banner, instructions)
session_tabs: pn.Tabs = pn.Tabs(("Welcome", tab_1))

def make_new_local_instance_tab(_: Any) -> None:
    """Create a new local session tab in the dashboard.

    Args:
        _ (Any): The event object (unused).

    This method creates a new local dashboard tab if the provided box name is valid and unique.
    """
    if box_name_TextInput.value == "":
        box_name_TextInput.placeholder = "Please enter a name and try again."
    elif box_name_TextInput.value in session_tabs._names:
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = "Name entered already exists. Please enter a different name."
    else:
        new_dashboard: WiredInterface = WiredInterface(box_name_TextInput.value)
        session_tabs.append((f"LOCAL - {box_name_TextInput.value}", new_dashboard.layout()))
        session_tabs.active = len(session_tabs) - 1
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = ""

def make_new_network_instance_tab(_: Any) -> None:
    """Create a new network session tab in the dashboard.

    Args:
        _ (Any): The event object (unused).

    This method creates a new network dashboard tab if the provided box name is valid and unique.
    """
    if box_name_TextInput.value == "":
        box_name_TextInput.placeholder = "Please enter a name and try again."
    elif box_name_TextInput.value in session_tabs._names:
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = "Name entered already exists. Please enter a different name."
    else:
        new_dashboard: WirelessInterface = WirelessInterface(box_name_TextInput.value)
        session_tabs.append((f"NETWORK - {box_name_TextInput.value}", new_dashboard.layout()))
        session_tabs.active = len(session_tabs) - 1
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = ""

make_new_local_instance_tab_button.on_click(make_new_local_instance_tab)
make_new_network_instance_tab_button.on_click(make_new_network_instance_tab)

footer: pn.pane.HTML = pn.pane.HTML(
    """
    <div style="text-align: center; padding: 10px; background-color: #333; color: white;">
        <p>Copyright © 2025 Otis Lab</p>
        <p>Developed by LogisTech</p>
        <p>For more information, visit our <a href="https://github.com/LogisTechLLC">GitHub page</a></p>
    </div>
    """,
    sizing_mode="stretch_width"
)

interface: pn.Column = pn.Column(
    start_area,
    pn.Spacer(height=75),
    session_tabs,
    footer
)

def serve_interface() -> None:
    """Serve the Panel interface in a browser.

    This function creates a Bootstrap template and launches the dashboard in a web browser.
    """
    template = pn.template.BootstrapTemplate(
        title="The Labrynth",
        logo=icon_path,
        main=interface,
        theme="dark",
        favicon=icon_path
    )
    pn.serve(template, port=7007, show=True)

class MainWindow(QMainWindow):
    """Launcher window for Labrynth that controls all processes."""

    def __init__(self) -> None:
        """Initialize the main window with a label, button, and start the Panel server."""
        super().__init__()
        self.setWindowTitle("The Labrynth Launcher")
        self.setGeometry(100, 100, 300, 150) 

        self.setWindowIcon(QIcon(icon_path))

        central_widget: QWidget = QWidget()
        self.setCentralWidget(central_widget)
        layout: QVBoxLayout = QVBoxLayout(central_widget)

        label: QLabel = QLabel("Opening session in browser...")
        label.setAlignment(Qt.AlignCenter)
        layout.addWidget(label)

        self.reopen_button: QPushButton = QPushButton("Re-open Dashboard")
        self.reopen_button.clicked.connect(self.reopen_session)
        layout.addWidget(self.reopen_button)

        self.panel_process: multiprocessing.Process = multiprocessing.Process(
            target=serve_interface, daemon=True
        )
        self.panel_process.start()
        label.setText("Session running in browser.\n(keep this window open)")

    def reopen_session(self) -> None:
        """Re-open the Panel dashboard in the default web browser.

        This method checks if the Panel server process is still running and, if so, opens the
        dashboard URL in the default browser. If the server is not running, it displays a warning.
        """
        if self.panel_process.is_alive():
            url: str = "http://localhost:7007"
            webbrowser.open(url)
        else:
            QMessageBox.warning(
                self,
                "Server Not Running",
                "The dashboard server is not running. Please restart the application."
            )

    def closeEvent(self, event: Any) -> None:
        """Handle the window close event with a confirmation dialog.

        Args:
            event (Any): The close event object.

        This method prompts the user to confirm quitting and terminates the Panel process if confirmed.
        """
        reply: QMessageBox.StandardButton = QMessageBox.question(
            self,
            "Quit the Labrynth",
            "Do you really want to quit? This action is irreversible.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            if self.panel_process.is_alive():
                self.panel_process.terminate()
                self.panel_process.join()
            event.accept()
        else:
            event.ignore()

if __name__ == "__main__":
    """Main entry point for the Labrynth application."""
    multiprocessing.freeze_support()
    
    app: QApplication = QApplication(sys.argv)
    window: MainWindow = MainWindow()
    window.show()
    
    sys.exit(app.exec())