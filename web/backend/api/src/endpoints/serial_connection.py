from flask import Blueprint, jsonify, request
from reacher.core import REACHER

def create_serial_bp(reacher: REACHER):
    bp = Blueprint('serial', __name__)

    @bp.route('/serial/comports', methods=['GET'])
    def get_available_ports():
        """
        Returns a list of available COM ports.
        """
        try:
            ports = reacher.get_COM_ports()
            return_dict = {
                'status': "Successfully accessed available COM ports",
                'ports': ports
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve COM ports: {str(e)}"}), 500

    @bp.route('/serial/port', methods=['POST'])
    def set_serial_port():
        """
        Sets the COM port for serial communication.
        """
        try:
            data = request.get_json()
            if not isinstance(data, dict) or 'port' not in data:
                raise ValueError("Request must contain a 'port' key")
            port = str(data['port']).strip()
            if port not in reacher.get_COM_ports():
                raise ValueError(f"Invalid or unavailable port: {port}")
            reacher.set_COM_port(port)
            return_dict = {
                'status': f"Successfully set COM port to {port}"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set COM port: {str(e)}"}), 500

    @bp.route('/serial/transmission', methods=['POST'])
    def start_serial_transmission():
        """
        Starts serial transmission with the microcontroller.
        """
        try:
            if not reacher.ser.port:
                raise ValueError("COM port not set")
            reacher.open_serial()
            return_dict = {
                'status': "Serial transmission started"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to start serial transmission: {str(e)}"}), 500

    @bp.route('/serial/termination', methods=['POST'])
    def end_serial_transmission():
        """
        Terminates serial transmission with the microcontroller.
        """
        try:
            reacher.close_serial()
            return_dict = {
                'status': "Serial transmission terminated"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to terminate serial transmission: {str(e)}"}), 500

    @bp.route('/serial/command', methods=['POST'])
    def send_serial_command():
        """
        Sends a command to the Arduino via serial.
        """
        try:
            data = request.get_json()
            if not isinstance(data, dict) or 'command' not in data:
                raise ValueError("Request must contain a 'command' key")
            command = str(data['command']).strip()
            if not command:
                raise ValueError("Command cannot be empty")
            reacher.send_serial_command(command)
            return_dict = {
                'status': f"Successfully sent command [{command}] to Arduino"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to send command: {str(e)}"}), 500
        
    return bp