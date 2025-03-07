from flask import Blueprint, jsonify, request
from reacher.reacher import REACHER

def create_file_bp(reacher: REACHER):
    bp = Blueprint('file', __name__)

    @bp.route('/file/filename', methods=['POST'])
    def set_filename():
        """
        Sets the filename for data export.
        """
        try:
            data = request.get_json()
            if not isinstance(data, dict) or 'name' not in data:
                raise ValueError("Request must contain a 'name' key")
            name = str(data['name']).strip()
            if not name:
                raise ValueError("Filename cannot be empty")
            reacher.set_filename(name)
            return_dict = {
                'status': f"Successfully set filename to {reacher.get_filename()}",
                'name': reacher.get_filename()
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set filename: {str(e)}"}), 500
        
    @bp.route('/file/filename', methods=['GET'])
    def get_filename():
        """
        Retrieves the current filename.
        """
        try:
            filename = reacher.get_filename()
            return_dict = {
                'status': "Successfully accessed filename" if filename else "No filename set",
                'name': filename
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve filename: {str(e)}"}), 500

    @bp.route('/file/destination', methods=['POST'])
    def set_destination():
        """
        Sets the data destination folder.
        """
        try:
            data = request.get_json()
            if not isinstance(data, dict) or 'destination' not in data:
                raise ValueError("Request must contain a 'destination' key")
            destination = str(data['destination']).strip()
            if not destination:
                raise ValueError("Destination cannot be empty")
            reacher.set_data_destination(destination)
            return_dict = {
                'status': f"Successfully set destination to {destination}",
                'destination': destination
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to set destination: {str(e)}"}), 500
        
    @bp.route('/file/destination', methods=['GET'])
    def get_destination():
        """
        Retrieves the current data destination folder.
        """
        try:
            destination = reacher.get_data_destination()
            return_dict = {
                'status': "Successfully accessed destination" if destination else "No destination set",
                'destination': destination
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve destination: {str(e)}"}), 500

    # New endpoint
    @bp.route('/file/create_folder', methods=['POST'])
    def create_destination_folder():
        """
        Creates the destination folder for data export and sets logging stream destination.
        """
        try:
            folder_path = reacher.make_destination_folder()
            reacher.set_logging_stream_destination(folder_path)
            return_dict = {
                'status': f"Successfully created folder at {folder_path}",
                'folder_path': folder_path
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': f"Failed to create folder: {str(e)}"}), 500
    
    return bp