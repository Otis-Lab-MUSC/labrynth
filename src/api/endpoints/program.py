from flask import Blueprint, jsonify, request
from reacher.reacher import REACHER
import os

def create_program_bp(reacher: REACHER):
    bp = Blueprint('program', __name__)

    @bp.route('/program/limit', methods=['POST'])
    def set_limit():
        """
        Sets program limits (type, infusion, time, delay).
        """
        try:
            data = request.get_json()
            if not isinstance(data, dict):
                raise ValueError("Request must be a JSON object")
            limit_type = data.get('type')
            infusion_limit = data.get('infusion_limit')
            time_limit = data.get('time_limit')
            delay = data.get('delay')
            if limit_type not in ['Time', 'Infusion', 'Both']:
                raise ValueError(f"Invalid limit type: {limit_type}")
            if not all(isinstance(x, (int, type(None))) for x in [infusion_limit, time_limit, delay]):
                raise ValueError("Limits must be integers or null")
            
            reacher.set_limit_type(limit_type)
            reacher.set_infusion_limit(infusion_limit)
            reacher.set_time_limit(time_limit)
            reacher.set_stop_delay(delay)
            return_dict = {
                'status': "Successfully set limit configuration"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set limits: {str(e)}"}), 500

    @bp.route('/program/start', methods=['POST'])
    def start_program():
        """
        Starts the program on the microcontroller.
        """
        try:
            reacher_log_path = os.path.expanduser(r'~/REACHER/LOG')
            if not os.path.exists(reacher_log_path):
                os.makedirs(reacher_log_path, exist_ok=True)
            reacher.set_logging_stream_destination(reacher_log_path)
            reacher.start_program()
            return_dict = {
                'status': "Successfully started program"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to start program: {str(e)}"}), 500

    @bp.route('/program/end', methods=['POST'])
    def stop_program():
        """
        Stops the program on the microcontroller.
        """
        try:
            reacher.stop_program()
            return_dict = {
                'status': "Successfully ended program"
            }
            return jsonify(return_dict), 200  
        except Exception as e:
            return jsonify({'error': f"Failed to stop program: {str(e)}"}), 500

    @bp.route('/program/interim', methods=['POST'])
    def pause_program():
        """
        Pauses or resumes the program.
        """
        try:
            if reacher.get_program_running():
                reacher.pause_program()
                return_dict = {
                    'status': "Successfully paused program",
                    'state': True
                }
            else:
                reacher.resume_program()
                return_dict = {
                    'status': "Successfully resumed program",
                    'state': False
                }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to pause/resume program: {str(e)}"}), 500

    @bp.route('/program/start_time', methods=['GET'])
    def get_start_time():
        """
        Returns the program start time.
        """
        try:
            start_time = reacher.get_start_time()
            return_dict = {
                'status': "Successfully accessed program start time",
                'start_time': start_time
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve start time: {str(e)}"}), 500
        
    @bp.route('/program/end_time', methods=['GET'])
    def get_end_time():
        """
        Returns the program end time.
        """
        try:
            end_time = reacher.get_end_time()
            return_dict = {
                'status': "Successfully accessed program end time",  # Fixed typo
                'end_time': end_time
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve end time: {str(e)}"}), 500

    @bp.route('/program/activity', methods=['GET'])
    def get_activity():
        """
        Returns the current program activity status.
        """
        try:
            program_running = reacher.get_program_running()
            return_dict = {
                'status': f"Program activity status: {program_running}",
                'activity': program_running
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve activity: {str(e)}"}), 500
        
    return bp