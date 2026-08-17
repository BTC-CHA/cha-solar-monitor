function setMobileFlow(lineId, particlesId, active) {
  const line = document.getElementById(lineId);
  const particles = document.getElementById(particlesId);
  if (line) line.classList.toggle("active", active);
  if (particles) particles.classList.toggle("active", active);
}

function updateMobileFlow(data) {
  const solarActive = data.pvPower > 10;
  const gridActive = data.gridCurrent > 0.1;
  const loadActive = data.loadPower > 10;
  const consumer1Active =
    data.consumer1Power > 10 || data.consumer1Current > 0.1;
  const batteryActive = Math.abs(data.batteryCurrent) > 0.2;

  setMobileFlow("mobileSolarPath", "mobileSolarParticles", solarActive);
  setMobileFlow("mobileGridIvPath", "mobileGridIvParticles", gridActive);
  setMobileFlow("mobileIvC2Path", "mobileIvC2Particles", loadActive);
  setMobileFlow("mobileGridC1Path", "mobileGridC1Particles", consumer1Active);
  setMobileFlow("mobileMcPath", "mobileMcParticles", consumer1Active);
  setMobileFlow("mobileHomePath", "mobileHomeParticles", loadActive);
  setMobileFlow("mobileBatteryPath", "mobileBatteryParticles", batteryActive);

  // Positive current = charging (IV to battery); negative = discharging.
  const batteryPath = document.getElementById("mobileBatteryPath");
  if (batteryPath) {
    batteryPath.setAttribute(
      "d",
      data.batteryCurrent < -0.2 ? "M180 337 V278" : "M180 278 V337"
    );
  }
}

const originalUpdateMobileCards = updateMobileCards;
updateMobileCards = function (data, source = "LIVE") {
  originalUpdateMobileCards(data, source);
  updateMobileFlow(data);
};
