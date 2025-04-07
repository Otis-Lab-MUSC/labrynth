from flask import Blueprint, jsonify, request
from typing import Dict, Any, Tuple, List
from reacher.core import REACHER

def create_serial_bp(reacher: REACHER) -> Blueprint:
    """Create a Blueprint for serial communication endpoints.

    **Description:**
    - Configures Flask Blueprint with routes for managing serial connections and commands.

    **Args:**
    - `reacher (REACHER)`: The REACHER instance to interact with.

    **Returns:**
    - `Blueprint`: The configured Flask Blueprint.
    """
    bp = Blueprint('serial', __name__)

    @bp.route('/serial/comports', methods=['GET'])
    def get_available_ports() -> Tuple[Dict[str, Any], int]:
        """Retrieve a list of available COM ports.

        **Description:**
        - Returns all detected serial ports on the system.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and ports, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            ports: List[str] = reacher.get_COM_ports()
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed available COM ports",
                'ports': ports
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve COM ports: {str(e)}"}), 500

    @bp.route('/serial/port', methods=['POST'])
    def set_serial_port() -> Tuple[Dict[str, Any], int]:
        """Set the COM port for serial communication.

        **Description:**
        - Configures the REACHER instance to use a specified serial port.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `ValueError`: If the request data or port is invalid.
        - `Exception`: For general errors during setting.
        """
        try:
            data: Dict[str, Any] = request.get_json()
            if not isinstance(data, dict) or 'port' not in data:
                raise ValueError("Request must contain a 'port' key")
            port: str = str(data['port']).strip()
            if port not in reacher.get_COM_ports():
                raise ValueError(f"Invalid or unavailable port: {port}")
            reacher.set_COM_port(port)
            return_dict: Dict[str, Any] = {
                'status': f"Successfully set COM port to {port}"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set COM port: {str(e)}"}), 500

    @bp.route('/serial/transmission', methods=['POST'])
    def start_serial_transmission() -> Tuple[Dict[str, Any], int]:
        """Start serial transmission with the microcontroller.

        **Description:**
        - Opens the serial connection and begins communication.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `ValueError`: If the COM port is not set.
        - `Exception`: For errors during transmission start.
        """
        try:
            if not reacher.ser.port:
                raise ValueError("COM port not set")
            reacher.open_serial()
            return_dict: Dict[str, Any] = {
                'status': "Serial transmission started"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to start serial transmission: {str(e)}"}), 500

    @bp.route('/serial/termination', methods=['POST'])
    def end_serial_transmission() -> Tuple[Dict[str, Any], int]:
        """Terminate serial transmission with the microcontroller.

        **Description:**
        - Closes the serial connection and stops communication.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during termination.
        """
        try:
            reacher.close_serial()
            return_dict: Dict[str, Any] = {
                'status': "Serial transmission terminated"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to terminate serial transmission: {str(e)}"}), 500

    @bp.route('/serial/command', methods=['POST'])
    def send_serial_command() -> Tuple[Dict[str, Any], int]:
        """Send a command to the Arduino via serial.

        **Description:**
        - Transmits a specified command to the connected microcontroller.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `ValueError`: If the request data or command is invalid.
        - `Exception`: For general errors during sending.
        """
        try:
            data: Dict[str, Any] = request.get_json()
            if not isinstance(data, dict) or 'command' not in data:
                raise ValueError("Request must contain a 'command' key")
            command: str = str(data['command']).strip()
            if not command:
                raise ValueError("Command cannot be empty")
            reacher.send_serial_command(command)
            return_dict: Dict[str, Any] = {
                'status': f"Successfully sent command [{command}] to Arduino"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to send command: {str(e)}"}), 500
        
    return bp