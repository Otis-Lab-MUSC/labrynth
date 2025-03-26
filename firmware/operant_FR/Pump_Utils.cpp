#include "Pump.h"\
#include <Arduino.h> 

void managePump(Pump *pump) {
  /*

     Controls pump operation; similar to 'manageCue(Cue &cue)'.

     @param *pump, pump of interest is also not a required parameter for this function to run, as this function gets fed into another method where the pump is not required
     @function, turns the pump on during the infusion period, otherwise keeps it off

  */
  long int timestamp = millis();
  if (pump->isArmed())
  { // if the pump is armed and the laser is not armed...
    if (timestamp <= pump->getInfusionEndTimestamp() && timestamp >= pump->getInfusionStartTimestamp())
    { // if the current time stamp is within the infusion time period...
      pump->on(); // turn the pump on
      pump->setRunning(true);
    }
    else
    { // outside the infusion time stamp
      pump->off(); // turn the pump off
      pump->setRunning(false);
    }
  }
}
