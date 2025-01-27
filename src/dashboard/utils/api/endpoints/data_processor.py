from flask import Blueprint, jsonify
from dashboard.utils.api.framework import REACHER

def create_data_processor_bp(reacher: REACHER):
    bp = Blueprint('processor', __name__)

    @bp.route('/processor/behavior_data', methods=['GET'])
    def get_behavior_data():
        """
        Calls function to return the current collected behavior processor summarized.
        """
        try:
            return_dict = {
                'status': (
                    f"Successfully accessed behavior processor summary"
                ),
                'data': reacher.get_behavior_data()
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @bp.route('/processor/data', methods=['GET'])
    def get_data():
        try:
            return_dict = {
                'status': (
                    f"Successfully accessed data"
                ),
                'data': reacher.get_behavior_data(),
                'frames ': reacher.get_frame_data()
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    @bp.route('/processor/arduino_configuration', methods=['GET'])
    def get_arduino_configuration():
        try:
            return_dict = {
                'status': (
                    f"Successfully accessed behavior processor"
                ),
                'arduino_configuration': reacher.get_arduino_configuration()
            }
            return jsonify(return_dict), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return bp
        

# # Utility # FIXME: process in main process
# def get_data_summary():
#     df = pd.DataFrame.from_records(shared.behavior_data, columns=['Component', 'Action', 'Start Timestamp', 'End Timestamp'])
#     rh_active_data = df[(df['Component'] == 'RH_LEVER') & (df['Action'] == 'ACTIVE_PRESS')]
#     rh_timeout_data = df[(df['Component'] == 'RH_LEVER') & (df['Action'] == 'TIMEOUT_PRESS')]
#     rh_inactive_data = df[(df['Component'] == 'RH_LEVER') & (df['Action'] == 'INACTIVE_PRESS')]
#     lh_active_data = df[(df['Component'] == 'LH_LEVER') & (df['Action'] == 'ACTIVE_PRESS')]
#     lh_timeout_data = df[(df['Component'] == 'LH_LEVER') & (df['Action'] == 'TIMEOUT_PRESS')]
#     lh_inactive_data = df[(df['Component'] == 'LH_LEVER') & (df['Action'] == 'INACTIVE_PRESS')]
#     pump_data = df[df['Component'] == 'PUMP']
#     laser_data = df[df['Component'] == 'LASER']
#     lick_data = df[df['Component'] == 'LICK_CIRCUIT']
#     summary_dict = {
#         'RH Active Presses': len(rh_active_data) if not rh_active_data.empty else 0,
#         'RH Timeout Presses': len(rh_timeout_data) if not rh_timeout_data.empty else 0,
#         'RH Inactive Presses': len(rh_inactive_data) if not rh_inactive_data.empty else 0,
#         'LH Active Presses': len(lh_active_data) if not lh_active_data.empty else 0,
#         'LH Timeout Presses': len(lh_timeout_data) if not lh_timeout_data.empty else 0,
#         'LH Inactive Presses': len(lh_inactive_data) if not lh_inactive_data.empty else 0,
#         'Infusions': len(pump_data['Action'] == 'INFUSION') if not pump_data.empty else 0,
#         'Stims': len(laser_data['Action'] == 'STIM') if not laser_data.empty else 0,
#         'Licks': len(lick_data['Action'] == 'LICK') if not lick_data.empty else 0,
#         'Frames': len(shared.frame_data)
#     }
#     return summary_dict


