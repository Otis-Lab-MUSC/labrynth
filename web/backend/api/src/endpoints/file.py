from flask import Blueprint, jsonify, request
from typing import Dict, Any, Tuple, Optional
from reacher.core import REACHER
import time

def create_file_bp(reacher: REACHER) -> Blueprint:
    """Create a Blueprint for file management endpoints.

    **Description:**
    - Configures Flask Blueprint with routes for managing filenames and data destinations.

    **Args:**
    - `reacher (REACHER)`: The REACHER instance to interact with.

    **Returns:**
    - `Blueprint`: The configured Flask Blueprint.
    """
    bp = Blueprint('file', __name__)

    @bp.route('/file/filename', methods=['POST'])
    def set_filename() -> Tuple[Dict[str, Any], int]:
        """Set the filename for data export.

        **Description:**
        - Configures the filename to be used for saving behavioral data.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and filename, and HTTP status code.

        **Raises:**
        - `ValueError`: If the request data is invalid.
        - `Exception`: For general errors during setting.
        """
        try:
            data: Dict[str, Any] = request.get_json()
            if not isinstance(data, dict) or 'name' not in data:
                raise ValueError("Request must contain a 'name' key")
            name: str = str(data['name']).strip()
            if not name:
                raise ValueError("Filename cannot be empty")
            reacher.set_filename(name)
            return_dict: Dict[str, Any] = {
                'status': f"Successfully set filename to {reacher.get_filename()}",
                'name': reacher.get_filename()
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set filename: {str(e)}"}), 500
        
    @bp.route('/file/filename', methods=['GET'])
    def get_filename() -> Tuple[Dict[str, Any], int]:
        """Retrieve the current filename.

        **Description:**
        - Returns the currently set filename or a default if none is set.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and filename, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            filename: Optional[str] = reacher.get_filename()
            if not filename:
                filename = f"REX_00{int(time.time())}.csv"
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed filename" if filename else f"No filename set, defaulting to {filename}",
                'name': filename
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve filename: {str(e)}"}), 500

    @bp.route('/file/destination', methods=['POST'])
    def set_destination() -> Tuple[Dict[str, Any], int]:
        """Set the data destination folder.

        **Description:**
        - Configures the folder where data files will be saved.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and destination, and HTTP status code.

        **Raises:**
        - `ValueError`: If the request data is invalid.
        - `Exception`: For general errors during setting.
        """
        try:
            data: Dict[str, Any] = request.get_json()
            if not isinstance(data, dict) or 'destination' not in data:
                raise ValueError("Request must contain a 'destination' key")
            destination: str = str(data['destination']).strip()
            if not destination:
                raise ValueError("Destination cannot be empty")
            reacher.set_data_destination(destination)
            return_dict: Dict[str, Any] = {
                'status': f"Successfully set destination to {destination}",
                'destination': destination
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set destination: {str(e)}"}), 500
        
    @bp.route('/file/destination', methods=['GET'])
    def get_destination() -> Tuple[Dict[str, Any], int]:
        """Retrieve the current data destination folder.

        **Description:**
        - Returns the currently set destination folder or None if not set.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and destination, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during retrieval.
        """
        try:
            destination: Optional[str] = reacher.get_data_destination()
            return_dict: Dict[str, Any] = {
                'status': "Successfully accessed destination" if destination else "No destination set",
                'destination': destination
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve destination: {str(e)}"}), 500

    @bp.route('/file/create_folder', methods=['POST'])
    def create_destination_folder() -> Tuple[Dict[str, Any], int]:
        """Create the destination folder for data export and set logging stream destination.

        **Description:**
        - Creates a unique folder for data storage and updates the logging stream path.

        **Returns:**
        - `Tuple[Dict[str, Any], int]`: A JSON response with status and folder path, and HTTP status code.

        **Raises:**
        - `Exception`: For errors during folder creation or setting.
        """
        try:
            folder_path: str = reacher.make_destination_folder()
            reacher.set_logging_stream_destination(folder_path)
            return_dict: Dict[str, Any] = {
                'status': f"Successfully created folder at {folder_path}",
                'folder_path': folder_path
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to create folder: {str(e)}"}), 500
    
    return bp