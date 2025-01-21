import panel as pn
from utils import dashboard, dashboard_lite
import tkinter as tk
from tkinter import messagebox
import pkg_resources
import sys, os
import multiprocessing

pn.extension('plotly')

box_name_TextInput = pn.widgets.TextInput(placeholder="Enter a box name")
make_new_local_instance_tab_button = pn.widgets.Button(name="New local session")

# FIXME: home tab should not launch API locally - make that a separate application
make_new_network_instance_tab_button = pn.widgets.Button(name="New network session (BETA)", disabled=True) 

start_area = pn.Column(
    pn.pane.Markdown("## Start here"),
    pn.Row(box_name_TextInput, pn.Column(
        make_new_local_instance_tab_button,
        make_new_network_instance_tab_button),
    )
)

if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
else:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))
icon_file_path = os.path.join(base_dir, 'utils/assets', 'reacher-icon.png')
icon = pn.Row(pn.HSpacer(), pn.pane.PNG(icon_file_path, width=400), pn.HSpacer())
tab_1 = pn.Column(
    pn.pane.Markdown("# Welcom to the REACHER Suite!"),
    icon
)
session_tabs = pn.Tabs(("Welcome", tab_1))

def make_new_local_instance_tab(_):
    if box_name_TextInput.value == "":
        box_name_TextInput.placeholder = "Please enter a name and try again."
    elif box_name_TextInput.value in session_tabs._names:
        box_name_TextInput.value = ""
        box_name_TextInput.placeholder = "Name entered already exists. Please enter a different name."
    else:
        new_dashboard = dashboard_lite.LDashboard()
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
        new_dashboard = dashboard.Dashboard()
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
        <p><i>"The heavens declare the glory of God, and the sky above proclaims his handiwork.<br>Day to day pours out speech, and night to night reveals knowledge."</i><br><br>Psalm 19:1 & 2</p>
        <p>Mapping the brain, marveling at the Creator.</p>
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
        site="LogisTech",
        logo=pkg_resources.resource_filename(__name__, 'utils/assets/reacher-app-icon.png'),
        main=interface, 
        theme="dark",
        favicon=pkg_resources.resource_filename(__name__, 'utils/assets/reacher-app-icon.ico')
    )
    pn.serve(template, show=True)   

def create_window():
    """
    Creates a minimal tkinter window with a taskbar icon.
    """
    root = tk.Tk()
    root.title("REACHER Dashboard")
    root.geometry("300x100")

    icon_path = pkg_resources.resource_filename(__name__, 'utils/assets/reacher-app-icon.ico')
    root.iconbitmap(icon_path)

    label = tk.Label(root, text="Opening REACHER Dashboard in browser...")
    label.pack(pady=20)

    def on_closing():
        if messagebox.askokcancel("Quit REACHER Dashboard", "Do you really want to quit? This action is irreversible."):
            root.destroy()
            if panel_process.is_alive():
                panel_process.terminate()
                panel_process.join()
            sys.exit(0)

    root.protocol("WM_DELETE_WINDOW", on_closing)
    return root

if __name__ == "__main__":
    multiprocessing.freeze_support()

    panel_process = multiprocessing.Process(target=serve_interface, daemon=True)
    panel_process.start()  

    application = create_window()
    application.mainloop()

    panel_process.join()