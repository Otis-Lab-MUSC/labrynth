#include "LickCircuit.h"
#include <Arduino.h> 

extern unsigned long int differenceFromStartTime;

void monitorLicking(LickCircuit &lickSpout) {
  static unsigned long lastDebounceTime = 0;
  const unsigned long debounceDelay = 25;
  if (lickSpout.isArmed())
  {
    bool currentLickState = digitalRead(lickSpout.getPin());
    if (currentLickState != lickSpout.getPreviousLickState())
    {
      lastDebounceTime = millis();
    }
    if ((millis() - lastDebounceTime) > debounceDelay)
    {
      if (currentLickState != lickSpout.getStableLickState())
      {
        lickSpout.setStableLickState(currentLickState);
        if (currentLickState == HIGH)
        {
          lickSpout.setLickTouchTimestamp(millis());
        }
        else
        {
          lickSpout.setLickReleaseTimestamp(millis());
          String lickEntry = "LICK_CIRCUIT,LICK," + String(lickSpout.getLickTouchTimestamp() - differenceFromStartTime) + "," + String(lickSpout.getLickReleaseTimestamp() - differenceFromStartTime);
          Serial.println(lickEntry);
        }
      }
    }
    lickSpout.setPreviousLickState(currentLickState);
  }
}
