#include "Device.h"
#include "Cue.h"
#include <Arduino.h> 

void connectionJingle(String connected, Cue &cue, bool &linkedToGUI) {
  if (connected == "LINK") {
    linkedToGUI = true;
    static int pitch = 500; // starting tone frequency
    for (int i = 0; i < 3; i++) {
      tone(cue.getPin(), pitch, 100);
      delay(100);
      noTone(cue.getPin());
      pitch += 500; // increase the frequency with each iteration
    }
    pitch = 500;              // reset the frequency
    Serial.println("LINKED"); // output connection status
  } else if (connected == "UNLINK") {
    linkedToGUI = false;
    static int pitch = 1500; // starting tone frequency
    for (int i = 0; i < 3; i++) {
      tone(cue.getPin(), pitch, 100);
      delay(100);
      noTone(cue.getPin());
      pitch -= 500; // decrease the frequency
    }
    pitch = 1500;               // reset the frequency
    Serial.println("UNLINKED"); // output connection status
  }
}

void manageCue(Cue *cue) {
  /*

     Controls cue tone operation.

     @param Cue *cue, the optional cue speaker object of interest
     @function, if the cue is armed and current time stamp is during the assigned tone time period, speaker turns on, otherwise turns the cue off

  */
  long int timestamp = millis();
  if (cue)
  {
    if (cue->isArmed())
    { // cue must be armed in order to run
      if (timestamp <= cue->getOffTimestamp() && timestamp >= cue->getOnTimestamp())
      { // if current time stamp is during the tone interval
        cue->on(); // turn on cue
        cue->setRunning(true);
      }
      else
      { // if the time stamp is not in a tone interval
        cue->off(); // turn cue off
        cue->setRunning(false);
      }
    }
  }
}
