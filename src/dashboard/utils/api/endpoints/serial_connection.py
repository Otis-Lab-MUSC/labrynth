from flask import Blueprint, jsonify, request
from dashboard.utils.api.framework import REACHER

def create_serial_bp(reacher: REACHER):
    bp = Blueprint('serial', __name__)

    @bp.route('/serial/comports', methods=['GET'])
    def get_available_ports():
        try:
            return_dict = {
                'status': "Successfully accessed available COM ports",
                'ports': reacher.get_COM_ports()
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500


    @bp.route('/serial/port', methods=['POST'])
    def set_serial_port():
        try:
            data = dict(request.get_json())
            port = data.get('port')
            reacher.set_COM_port(port)
            return_dict = {
                'status': f"Successfully set COM port to {port}"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"API ERROR: {str(e)}"}), 500


    @bp.route('/serial/transmission', methods=['POST'])
    def start_serial_transmission():
        try:
            reacher.open_serial()
            return_dict = {
                'status': "Serial transmission started"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'status': f"Error: {str(e)}"}), 500


    @bp.route('/serial/termination', methods=['POST'])
    def end_serial_transmission():
        try:
            reacher.close_serial()
            return_dict = {
                'status': "Serial transmission terminated"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500


    @bp.route('/serial/command', methods=['POST'])
    def send_serial_command():
        try:
            data = dict(request.get_json())
            command = data.get('command')
            reacher.send_serial_command(command)
            return_dict = {
                'status': f"Successfully sent command [{command}] to Arduino"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    return bp