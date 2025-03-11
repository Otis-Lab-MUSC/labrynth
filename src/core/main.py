import panel as pn
from reacher.local_dashboard import Dashboard as local_dash
from reacher.network_dashboard import Dashboard as network_dash
import sys, os, multiprocessing

from PySide6.QtWidgets import QApplication, QMainWindow, QLabel, QMessageBox
from PySide6.QtGui import QIcon
from PySide6.QtCore import Qt

pn.extension('plotly')

box_name_TextInput = pn.widgets.TextInput(placeholder="Enter a box name")
make_new_local_instance_tab_button = pn.widgets.Button(name="New local session")
make_new_network_instance_tab_button = pn.widgets.Button(name="New network session (BETA)") 

start_area = pn.Column(
    pn.pane.Markdown("## Create a session"),
    pn.Row(box_name_TextInput, pn.Column(
        make_new_local_instance_tab_button,
        make_new_network_instance_tab_button),
    )
)

if getattr(sys, 'frozen', False): # Packaged (frozen) environment: assets are in 'assets' relative to sys._MEIPASS
    assets_dir = os.path.join(sys._MEIPASS, 'assets')
else: # Development environment: assets are in 'assets' relative to main.py (src/core/assets)
    assets_dir = os.path.join('..', 'reacher', 'assets')

icon_path = os.path.join(assets_dir, 'reacher-app-icon.png')

if not os.path.isfile(icon_path):
    print(f"Warning: Icon file not found at {icon_path}. Proceeding without custom icon.")

icon = pn.pane.PNG(os.path.join(assets_dir, 'reacher-icon-banner.png'), width=600)
instructions = pn.pane.Markdown(
    """
    # Setting Up a Session

    Welcome to the REACHER Suite! Follow these steps to set up and run your experiment session:

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

tab_1 = pn.Column(
    icon,
    instructions
)
session_tabs = pn.Tabs(("Welcome", tab_1))

def make_new_local_instance_tab(_):
    if box_name_TextInput.value == "":
        box_name_TextInput.placeholder = "Please enter a name and try again."
    elif box_name_TextInput.value in session_tabs._names:
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = "Name entered already exists. Please enter a different name."
    else:
        new_dashboard = local_dash()
        session_tabs.append((f"LOCAL - {box_name_TextInput.value}", new_dashboard.layout()))
        session_tabs.active = len(session_tabs) - 1
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = ""

def make_new_network_instance_tab(_):
    if box_name_TextInput.value == "":
        box_name_TextInput.placeholder = "Please enter a name and try again."
    elif box_name_TextInput.value in session_tabs._names:
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = "Name entered already exists. Please enter a different name."
    else:
        new_dashboard = network_dash()
        session_tabs.append((f"NETWORK - {box_name_TextInput.value}", new_dashboard.layout()))
        session_tabs.active = len(session_tabs) - 1
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = ""

make_new_local_instance_tab_button.on_click(make_new_local_instance_tab)
make_new_network_instance_tab_button.on_click(make_new_network_instance_tab)

footer = pn.pane.HTML(
    """
    <div style="text-align: center; padding: 10px; background-color: #333; color: white;">
        <p>© 2025 LogisTech. All rights reserved.</p><br>
        <p><i>"The heavens declare the glory of God, and the sky above proclaims his handiwork."</i>
        <p>Psalm 19:1</p>
    </div>
    """,
    sizing_mode="stretch_width", 
)

interface = pn.Column(
    start_area,
    pn.Spacer(height=75),
    session_tabs, 
    footer
)

def serve_interface():
    template = pn.template.BootstrapTemplate(
        title="REACHER Dashboard", 
        logo=icon_path,
        main=interface, 
        theme="dark",
        favicon=icon_path
    )
    pn.serve(template, show=True)

def create_window():
    """
    Creates a minimal PySide6 window with a taskbar icon.
    """
    app = QApplication(sys.argv)
    
    window = QMainWindow()
    window.setWindowTitle("REACHER Dashboard Launcher")
    window.setGeometry(100, 100, 300, 100)

    window.setWindowIcon(QIcon(icon_path))

    label = QLabel("Opening REACHER Dashboard in browser...\n(keep this window open)")
    label.setAlignment(Qt.AlignCenter)
    window.setCentralWidget(label)

    def on_closing(event=None):
        reply = QMessageBox.question(
            window,
            "Quit REACHER Dashboard",
            "Do you really want to quit? This action is irreversible.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            window.close()
            if panel_process.is_alive():
                panel_process.terminate()
                panel_process.join()
            sys.exit(0)

    window.closeEvent = on_closing
    
    window.show()  
    return app  

if __name__ == "__main__":
    multiprocessing.freeze_support()
    
    panel_process = multiprocessing.Process(target=serve_interface, daemon=True)
    panel_process.start()  

    app = create_window()
    sys.exit(app.exec()) 