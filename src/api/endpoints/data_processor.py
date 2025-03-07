from flask import Blueprint, jsonify
from reacher.reacher import REACHER

def create_data_processor_bp(reacher: REACHER):
    bp = Blueprint('processor', __name__)

    @bp.route('/processor/behavior_data', methods=['GET'])
    def get_behavior_data():
        """
        Returns the current collected behavior data.
        """
        try:
            behavior_data = reacher.get_behavior_data()
            if not isinstance(behavior_data, list):
                raise ValueError("Behavior data is not a list")
            return_dict = {
                'status': "Successfully accessed behavior data",
                'data': behavior_data
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve behavior data: {str(e)}"}), 500
        
    @bp.route('/processor/data', methods=['GET'])
    def get_data():
        """
        Returns both behavior and frame data for export.
        """
        try:
            behavior_data = reacher.get_behavior_data()
            frame_data = reacher.get_frame_data()
            if not isinstance(behavior_data, list) or not isinstance(frame_data, list):
                raise ValueError("Data is not in the expected list format")
            return_dict = {
                'status': "Successfully accessed data",
                'data': behavior_data,
                'frames': frame_data 
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve data: {str(e)}"}), 500
        
    @bp.route('/processor/arduino_configuration', methods=['GET'])
    def get_arduino_configuration():
        """
        Returns the current Arduino configuration.
        """
        try:
            config = reacher.get_arduino_configuration()
            if not isinstance(config, dict):
                raise ValueError("Arduino configuration is not a dict")
            return_dict = {
                'status': "Successfully accessed Arduino configuration",
                'arduino_configuration': config
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve Arduino configuration: {str(e)}"}), 500
    
    return bp

