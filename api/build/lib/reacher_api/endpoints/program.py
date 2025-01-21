from flask import Blueprint, jsonify, request
from reacher_api.toolkit import REACHER

def create_program_bp(reacher: REACHER):
    bp = Blueprint('program', __name__)

    @bp.route('/program/limit', methods=['POST'])
    def set_limit():
        try:
            data = dict(request.get_json())
            limit_type = data.get('type')
            infusion_limit = data.get('infusion_limit')
            time_limit = data.get('time_limit')
            delay = data.get('delay')

            reacher.set_limit_type(limit_type)
            reacher.set_infusion_limit(infusion_limit)
            reacher.set_time_limit(time_limit)
            reacher.set_stop_delay(delay)
            return_dict = {
                'status': (
                    f"Successfully set limit configuration"
                )
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @bp.route('/program/start', methods=['POST'])
    def start_program():
        try:
            reacher.start_program()
            return_dict = {
                'status': (
                    f"Successfully started program"
                )
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @bp.route('/program/end', methods=['POST'])
    def stop_program():
        try:
            reacher.stop_program()
            return_dict = {
                'status': (
                    f"Successfully ended program."
                )
            }
            return jsonify(return_dict), 200  
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @bp.route('/program/interim', methods=['POST'])
    def pause_program():
        try:
            if reacher.program_flag.is_set():
                reacher.resume_program()
                return_dict = {
                    'status': (
                        f"Successfully resumed program"
                    ),
                    'state': False
                }
            else:
                reacher.pause_program()
                return_dict = {
                    'status': (
                        f"Successfully paused program"
                    ),
                    'state': True
                }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @bp.route('/program/start_time', methods=['GET'])
    def get_start_time():
        try:
            start_time = reacher.get_start_time()
            return_dict = {
                'status': (
                    f"Successfully accessed program start time"
                ), 
                'start_time': start_time
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @bp.route('/program/end_time', methods=['GET'])
    def get_end_time():
        """
        Returns program end time.
        """
        try:
            end_time = reacher.get_end_time()
            return_dict = {
                'status': (
                    f"Successfully accessed program ene time"
                ), 
                'end_time': end_time
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @bp.route('/program/activity', methods=['GET'])
    def get_activity():
        """
        Returns program start time.
        """
        try:
            program_running = reacher.get_program_running()
            return_dict = {
                'status': (
                    f"Program activity status: {program_running}"
                ), 
                'activity': program_running
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    return bp
        
