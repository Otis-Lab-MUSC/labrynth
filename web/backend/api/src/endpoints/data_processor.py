from flask import Blueprint, jsonify
from typing import Dict, Any, Tuple, List, Union
from reacher.core import REACHER

def create_data_processor_bp(reacher: REACHER) -> Blueprint:
    """Create a Blueprint for data processing endpoints.

    **Description:**
    - Configures Flask Blueprint with routes for accessing behavioral and frame data.

    **Args:**
    - `reacher (REACHER)`: The REACHER instance to interact with.

    **Returns:**
    - `Blueprint`: The configured Flask Blueprint.
    """
    bp = Blueprint('processor', __name__)

    @bp.route('/processor/behavior_data', methods=['GET'])
    def get_behavior_data() -> Tuple[Dict[str, Any], int]:
        """Retrieve the current collected behavior data.

        **Description:**
        - Returns behavioral data (e.g., lever presses) collected by the REACHER instance.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and data, and HTTP status code.

        **Raises:**
        - `ValueError`: If behavior data is not in the expected format.
        - `Exception`: For general errors during retrieval.
        """
        try:
            behavior_data: List[Dict[str, Union[str, int]]] = reacher.get_behavior_data()
            if not isinstance(behavior_data, list):
                raise ValueError("Behavior data is not a list")
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed behavior data",
                'data': behavior_data
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve behavior data: {str(e)}"}), 500
        
    @bp.route('/processor/data', methods=['GET'])
    def get_data() -> Tuple[Dict[str, Any], int]:
        """Retrieve both behavior and frame data for export.

        **Description:**
        - Returns all collected behavioral and frame data in a single response.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status, data, and frames, and HTTP status code.

        **Raises:**
        - `ValueError`: If data is not in the expected list format.
        - `Exception`: For general errors during retrieval.
        """
        try:
            behavior_data: List[Dict[str, Union[str, int]]] = reacher.get_behavior_data()
            frame_data: List[str] = reacher.get_frame_data()
            if not isinstance(behavior_data, list) or not isinstance(frame_data, list):
                raise ValueError("Data is not in the expected list format")
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed data",
                'data': behavior_data,
                'frames': frame_data 
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve data: {str(e)}"}), 500
        
    @bp.route('/processor/arduino_configuration', methods=['GET'])
    def get_arduino_configuration() -> Tuple[Dict[str, Any], int]:
        """Retrieve the current Arduino configuration.

        **Description:**
        - Returns the configuration data received from the microcontroller.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and configuration, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            config: Dict = reacher.get_arduino_configuration()
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed Arduino configuration",
                'arduino_configuration': config
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve Arduino configuration: {str(e)}"}), 500
    
    return bp