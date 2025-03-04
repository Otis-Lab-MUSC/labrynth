#ifndef LEVER_H
#define LEVER_H

#include "Device.h"
#include <Arduino.h>

class Lever : public Device {
public:
  bool previousLeverState; // For comparing with the current pressing state
  bool stableLeverState; // The stable state of the lever after debouncing
  unsigned long int pressTimestamp; // Timestamp for when lever press occurs
  unsigned long int releaseTimestamp; // Timestamp for when lever release occurs
  String orientation; // Lever's orientation (i.e., "RH" or "LH")
  String pressType; // Press type: 'ACTIVE', 'INACTIVE', or 'NO CONDITION'

  Lever(byte initPin);
  void setPreviousLeverState(bool initState);
  void setStableLeverState(bool state); // New method to update the stable state
  void setPressTimestamp(long int initTimestamp);
  void setReleaseTimestamp(long int initTimestamp);
  void setOrientation(String initOrientation);
  void setPressType(String initPressType);
  bool getPreviousLeverState() const;
  bool getStableLeverState() const; // New method to get the stable state
  long int getPressTimestamp() const;
  long int getReleaseTimestamp() const;
  String getOrientation() const;
  String getPressType() const;
  
};

#endif // LEVER_H
