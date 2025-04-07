from flask import Blueprint, jsonify, request
from typing import Dict, Any, Tuple, Optional
from reacher.core import REACHER
import os

def create_program_bp(reacher: REACHER) -> Blueprint:
    """Create a Blueprint for program control endpoints.

    **Description:**
    - Configures Flask Blueprint with routes for managing the REACHER experiment program.

    **Args:**
    - `reacher (REACHER)`: The REACHER instance to interact with.

    **Returns:**
    - `Blueprint`: The configured Flask Blueprint.
    """
    bp = Blueprint('program', __name__)

    @bp.route('/program/limit', methods=['POST'])
    def set_limit() -> Tuple[Dict[str, Any], int]:
        """Set program limits (type, infusion, time, delay).

        **Description:**
        - Configures the experiment stopping conditions (time, infusion count, or both).

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `ValueError`: If the request data or limit type is invalid.
        - `Exception`: For general errors during setting.
        """
        try:
            data: Dict[str, Any] = request.get_json()
            if not isinstance(data, dict):
                raise ValueError("Request must be a JSON object")
            limit_type: Optional[str] = data.get('type')
            infusion_limit: Optional[int] = data.get('infusion_limit')
            time_limit: Optional[int] = data.get('time_limit')
            delay: Optional[int] = data.get('delay')
            if limit_type not in ['Time', 'Infusion', 'Both']:
                raise ValueError(f"Invalid limit type: {limit_type}")
            if not all(isinstance(x, (int, type(None))) for x in [infusion_limit, time_limit, delay]):
                raise ValueError("Limits must be integers or null")
            
            reacher.set_limit_type(limit_type)
            reacher.set_infusion_limit(infusion_limit)
            reacher.set_time_limit(time_limit)
            reacher.set_stop_delay(delay)
            return_dict: Dict[str, Any] = {
                'status': "Successfully set limit configuration"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set limits: {str(e)}"}), 500

    @bp.route('/program/start', methods=['POST'])
    def start_program() -> Tuple[Dict[str, Any], int]:
        """Start the program on the microcontroller.

        **Description:**
        - Initiates the experiment and sets up logging.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during program start.
        """
        try:
            reacher_log_path: str = os.path.expanduser(r'~/REACHER/LOG')
            if not os.path.exists(reacher_log_path):
                os.makedirs(reacher_log_path, exist_ok=True)
            reacher.set_logging_stream_destination(reacher_log_path)
            reacher.start_program()
            return_dict: Dict[str, Any] = {
                'status': "Successfully started program"
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to start program: {str(e)}"}), 500

    @bp.route('/program/end', methods=['POST'])
    def stop_program() -> Tuple[Dict[str, Any], int]:
        """Stop the program on the microcontroller.

        **Description:**
        - Terminates the running experiment.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during program stop.
        """
        try:
            reacher.stop_program()
            return_dict: Dict[str, Any] = {
                'status': "Successfully ended program"
            }
            return jsonify(return_dict), 200  
        except Exception as e:
            return jsonify({'error': f"Failed to stop program: {str(e)}"}), 500

    @bp.route('/program/interim', methods=['POST'])
    def pause_program() -> Tuple[Dict[str, Any], int]:
        """Pause or resume the program.

        **Description:**
        - Toggles the experiment between paused and running states.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and state, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during pause/resume.
        """
        try:
            if reacher.get_program_running():
                reacher.pause_program()
                return_dict: Dict[str, Any] = {
                    'status': "Successfully paused program",
                    'state': True
                }
            else:
                reacher.resume_program()
                return_dict: Dict[str, Any] = {
                    'status': "Successfully resumed program",
                    'state': False
                }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to pause/resume program: {str(e)}"}), 500

    @bp.route('/program/start_time', methods=['GET'])
    def get_start_time() -> Tuple[Dict[str, Any], int]:
        """Retrieve the program start time.

        **Description:**
        - Returns the timestamp when the experiment began.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and start time, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            start_time: Optional[float] = reacher.get_start_time()
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed program start time",
                'start_time': start_time
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve start time: {str(e)}"}), 500
        
    @bp.route('/program/end_time', methods=['GET'])
    def get_end_time() -> Tuple[Dict[str, Any], int]:
        """Retrieve the program end time.

        **Description:**
        - Returns the timestamp when the experiment ended.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and end time, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            end_time: Optional[float] = reacher.get_end_time()
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed program end time",
                'end_time': end_time
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve end time: {str(e)}"}), 500

    @bp.route('/program/activity', methods=['GET'])
    def get_activity() -> Tuple[Dict[str, Any], int]:
        """Retrieve the current program activity status.

        **Description:**
        - Returns whether the experiment is currently running.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and activity, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            program_running: bool = reacher.get_program_running()
            return_dict: Dict[str, Any] = {
                'status': f"Program activity status: {program_running}",
                'activity': program_running
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve activity: {str(e)}"}), 500
        
    return bp