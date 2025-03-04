import curses
import sys
import json
from core.hardware.reacher import REACHER  # Assuming your class is in a file named REACHER.py

def draw_menu(stdscr, selected_row_idx, menu, title="REACHER CLI"):
    stdscr.clear()
    h, w = stdscr.getmaxyx()
    stdscr.addstr(0, w // 2 - len(title) // 2, title)
    
    for idx, row in enumerate(menu):
        x = w // 2 - len(row) // 2
        y = h // 2 - len(menu) // 2 + idx
        if idx == selected_row_idx:
            stdscr.attron(curses.color_pair(1))
            stdscr.addstr(y, x, row)
            stdscr.attroff(curses.color_pair(1))
        else:
            stdscr.addstr(y, x, row)
    
    stdscr.addstr(h - 1, 0, "Use UP/DOWN to navigate, ENTER to select, Q to quit")
    stdscr.refresh()

def get_user_input(stdscr, prompt, default=""):
    stdscr.clear()
    h, w = stdscr.getmaxyx()
    stdscr.addstr(h // 2 - 1, 0, prompt)
    if default:
        stdscr.addstr(h // 2, 0, f"Default: {default}")
    stdscr.addstr(h // 2 + 1, 0, "> ")
    stdscr.refresh()
    curses.echo()
    input_str = stdscr.getstr(h // 2 + 1, 2, 50).decode('utf-8').strip()
    curses.noecho()
    return input_str if input_str else default

def select_from_list(stdscr, title, items):
    if not items:
        items = ["No options available"]
    current_row = 0
    while True:
        stdscr.clear()
        h, w = stdscr.getmaxyx()
        stdscr.addstr(0, w // 2 - len(title) // 2, title)
        for idx, item in enumerate(items):
            x = w // 2 - len(item) // 2
            y = h // 2 - len(items) // 2 + idx
            if idx == current_row:
                stdscr.attron(curses.color_pair(1))
                stdscr.addstr(y, x, f"{idx + 1}. {item}")
                stdscr.attroff(curses.color_pair(1))
            else:
                stdscr.addstr(y, x, f"{idx + 1}. {item}")
        stdscr.addstr(h - 1, 0, "Use UP/DOWN to select, ENTER to confirm, Q to cancel")
        stdscr.refresh()

        key = stdscr.getch()
        if key == curses.KEY_UP and current_row > 0:
            current_row -= 1
        elif key == curses.KEY_DOWN and current_row < len(items) - 1:
            current_row += 1
        elif key == curses.KEY_ENTER or key in [10, 13]:
            return items[current_row] if items else None
        elif key == ord('q') or key == ord('Q'):
            return None

def show_message(stdscr, message, wait_for_key=True):
    stdscr.clear()
    h, w = stdscr.getmaxyx()
    stdscr.addstr(h // 2, w // 2 - len(message) // 2, message)
    if wait_for_key:
        stdscr.addstr(h - 1, 0, "Press any key to continue...")
    stdscr.refresh()
    if wait_for_key:
        stdscr.getch()

def handle_submenu(stdscr, menu, reacher, current_port):
    current_row = 0
    while True:
        draw_menu(stdscr, current_row, menu)
        key = stdscr.getch()

        if key == curses.KEY_UP and current_row > 0:
            current_row -= 1
        elif key == curses.KEY_DOWN and current_row < len(menu) - 1:
            current_row += 1
        elif key == curses.KEY_ENTER or key in [10, 13]:
            return current_row + 1  # Return 1-based index
        elif key == ord('q') or key == ord('Q'):
            return None

def main(stdscr):
    # Initialize curses
    curses.curs_set(0)
    curses.init_pair(1, curses.COLOR_BLACK, curses.COLOR_WHITE)
    stdscr.clear()

    # Initialize REACHER
    reacher = REACHER()
    current_port = None

    main_menu = [
        "1. Ports and Serial",
        "2. Send Serial Command",
        "3. Program Control",
        "4. Settings",
        "5. View Data",
        "6. Exit"
    ]

    ports_menu = [
        "1. List COM Ports",
        "2. Set COM Port",
        "3. Open Serial",
        "4. Close Serial",
        "5. Back"
    ]

    program_menu = [
        "1. Start Program",
        "2. Pause Program",
        "3. Resume Program",
        "4. Stop Program",
        "5. Back"
    ]

    settings_menu = [
        "1. Set Limit Type (Time/Infusion/Both)",
        "2. Set Infusion Limit",
        "3. Set Time Limit",
        "4. Set Stop Delay",
        "5. Set Data Destination",
        "6. Set Filename",
        "7. Back"
    ]

    data_menu = [
        "1. Show Behavior Data",
        "2. Show Frame Data",
        "3. Show Arduino Configuration",
        "4. Back"
    ]

    current_row = 0
    while True:
        draw_menu(stdscr, current_row, main_menu)
        key = stdscr.getch()

        if key == curses.KEY_UP and current_row > 0:
            current_row -= 1
        elif key == curses.KEY_DOWN and current_row < len(main_menu) - 1:
            current_row += 1
        elif key == curses.KEY_ENTER or key in [10, 13]:
            selection = current_row + 1
            if selection == 1:  # Ports and Serial
                while True:
                    sub_selection = handle_submenu(stdscr, ports_menu, reacher, current_port)
                    if sub_selection == 1:  # List COM Ports
                        ports = reacher.get_COM_ports()
                        show_message(stdscr, f"Available Ports: {', '.join(ports)}")
                    elif sub_selection == 2:  # Set COM Port
                        ports = reacher.get_COM_ports()
                        selected_port = select_from_list(stdscr, "Select a COM Port:", ports)
                        if selected_port and selected_port != "No available ports":
                            try:
                                reacher.set_COM_port(selected_port)
                                current_port = selected_port
                                show_message(stdscr, f"COM Port set to: {selected_port}")
                            except Exception as e:
                                show_message(stdscr, f"Error: {e}")
                    elif sub_selection == 3:  # Open Serial
                        if current_port:
                            try:
                                reacher.open_serial()
                                show_message(stdscr, f"Serial opened on {current_port}")
                            except Exception as e:
                                show_message(stdscr, f"Error: {e}")
                        else:
                            show_message(stdscr, "Please set a COM port first!")
                    elif sub_selection == 4:  # Close Serial
                        try:
                            reacher.close_serial()
                            show_message(stdscr, "Serial connection closed")
                        except Exception as e:
                            show_message(stdscr, f"Error: {e}")
                    elif sub_selection == 5 or sub_selection is None:  # Back or Quit
                        break

            elif selection == 2:  # Send Serial Command
                cmd = get_user_input(stdscr, "Enter command to send: ")
                if cmd:
                    try:
                        reacher.send_serial_command(cmd)
                        show_message(stdscr, f"Sent: {cmd}")
                    except Exception as e:
                        show_message(stdscr, f"Error: {e}")

            elif selection == 3:  # Program Control
                while True:
                    sub_selection = handle_submenu(stdscr, program_menu, reacher, current_port)
                    if sub_selection == 1:
                        reacher.start_program()
                        show_message(stdscr, f"Program started at {reacher.get_time()}")
                    elif sub_selection == 2:
                        reacher.pause_program()
                        show_message(stdscr, "Program paused")
                    elif sub_selection == 3:
                        reacher.resume_program()
                        show_message(stdscr, "Program resumed")
                    elif sub_selection == 4:
                        reacher.stop_program()
                        show_message(stdscr, f"Program stopped at {reacher.get_time()}")
                    elif sub_selection == 5 or sub_selection is None:
                        break

            elif selection == 4:  # Settings
                while True:
                    sub_selection = handle_submenu(stdscr, settings_menu, reacher, current_port)
                    if sub_selection == 1:
                        limit_type = select_from_list(stdscr, "Select Limit Type:", ["Time", "Infusion", "Both"])
                        if limit_type:
                            reacher.set_limit_type(limit_type)
                            show_message(stdscr, f"Limit type set to: {limit_type}")
                    elif sub_selection == 2:
                        limit = get_user_input(stdscr, "Enter infusion limit: ")
                        if limit:
                            reacher.set_infusion_limit(int(limit))
                            show_message(stdscr, f"Infusion limit set to: {limit}")
                    elif sub_selection == 3:
                        limit = get_user_input(stdscr, "Enter time limit (seconds): ")
                        if limit:
                            reacher.set_time_limit(int(limit))
                            show_message(stdscr, f"Time limit set to: {limit}")
                    elif sub_selection == 4:
                        delay = get_user_input(stdscr, "Enter stop delay (seconds): ")
                        if delay:
                            reacher.set_stop_delay(int(delay))
                            show_message(stdscr, f"Stop delay set to: {delay}")
                    elif sub_selection == 5:
                        folder = get_user_input(stdscr, "Enter data destination folder: ")
                        if folder:
                            reacher.set_data_destination(folder)
                            show_message(stdscr, f"Data destination set to: {folder}")
                    elif sub_selection == 6:
                        filename = get_user_input(stdscr, "Enter filename: ")
                        if filename:
                            reacher.set_filename(filename)
                            show_message(stdscr, f"Filename set to: {filename}")
                    elif sub_selection == 7 or sub_selection is None:
                        break

            elif selection == 5:  # View Data
                while True:
                    sub_selection = handle_submenu(stdscr, data_menu, reacher, current_port)
                    if sub_selection == 1:
                        data = reacher.get_behavior_data()
                        show_message(stdscr, f"Behavior Data: {data}")
                    elif sub_selection == 2:
                        data = reacher.get_frame_data()
                        show_message(stdscr, f"Frame Data: {data}")
                    elif sub_selection == 3:
                        config = reacher.get_arduino_configuration()
                        show_message(stdscr, f"Arduino Config: {json.dumps(config, indent=4)}")
                    elif sub_selection == 4 or sub_selection is None:
                        break

            elif selection == 6:  # Exit
                show_message(stdscr, "Exiting...", wait_for_key=False)
                break

        elif key == ord('q') or key == ord('Q'):
            show_message(stdscr, "Exiting...", wait_for_key=False)
            break

if __name__ == "__main__":
    curses.wrapper(main)