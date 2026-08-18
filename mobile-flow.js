function setMobileFlow(lineId, particlesId, active) {
  const line = document.getElementById(lineId);
  const particles = document.getElementById(particlesId);
  if (line) line.classList.toggle("active", active);
  if (particles) particles.classList.toggle("active", active);
}

function setMobileFlowText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function getMobilePowerSource(data) {
  const solarActive = Number(data.pvPower) > 30;
  const gridActive = Number(data.inverterGridCurrent) > 0.25;
  // SRNE reports positive battery current while the battery supplies the IV.
  const batteryDischarging = Number(data.batteryCurrent) > 1;

  if (gridActive && (solarActive || batteryDischarging)) {
    return { label: solarActive ? "GRID + SOLAR" : "GRID + BATTERY", tone: "mixed" };
  }
  if (gridActive) return { label: "GRID MODE", tone: "grid" };
  if (solarActive && batteryDischarging) {
    return { label: "SOLAR + BATTERY", tone: "mixed" };
  }
  if (solarActive) return { label: "SOLAR MODE", tone: "solar" };
  if (batteryDischarging) return { label: "BATTERY MODE", tone: "battery" };
  return { label: "STANDBY", tone: "mixed" };
}

function updateMobileFlow(data) {
  data = addBranchEstimates(data);
  const solarActive = data.pvPower > 10;
  const gridActive = data.gridCurrent > 0.1;
  const loadActive = data.loadPower > 10;
  const consumer1Active =
    data.consumer1Connected &&
    (data.consumer1Power > 10 || data.consumer1Current > 0.1);
  const batteryActive = Math.abs(data.batteryCurrent) > 0.2;
  const batteryPower = Math.abs(Number(data.batteryVoltage) * Number(data.batteryCurrent));
  const source = getMobilePowerSource(data);

  setMobileFlow("mobileSolarPath", "mobileSolarParticles", solarActive);
  setMobileFlow("mobileGridC1Path", "mobileGridC1Particles", gridActive || consumer1Active);
  setMobileFlow(
    "mobileC1IvPath",
    "mobileC1IvParticles",
    data.inverterGridPowerEstimate > 5
  );
  const ivStandbyLine = document.getElementById("mobileC1IvPath");
  const ivStandbyParticles = document.getElementById("mobileC1IvParticles");
  if (ivStandbyLine) ivStandbyLine.classList.toggle("standby-flow", data.inverterGridStandby);
  if (ivStandbyParticles) ivStandbyParticles.classList.toggle("standby-flow", data.inverterGridStandby);
  setMobileFlow("mobileIvC2Path", "mobileIvC2Particles", loadActive);
  setMobileFlow(
    "mobileMcPath",
    "mobileMcParticles",
    data.machinePowerEstimate > 10
  );
  setMobileFlow("mobileHomePath", "mobileHomeParticles", loadActive);
  setMobileFlow("mobileBatteryPath", "mobileBatteryParticles", batteryActive);

  setMobileFlowText("flowSolarValue", `${Math.round(Number(data.pvPower))}W`);
  setMobileFlowText(
    "flowGridMainValue",
    gridActive ? `${Math.round(Number(data.gridPower))}W` : "0W"
  );
  setMobileFlowText(
    "flowGridIvValue",
    data.inverterGridPowerEstimate > 5
      ? `≈${Math.round(data.inverterGridPowerEstimate)}W`
      : "0W"
  );
  setMobileFlowText("flowLoadValue", `${Math.round(Number(data.loadPower))}W`);
  setMobileFlowText(
    "flowMachineValue",
    data.consumer1Connected ? `≈${Math.round(data.machinePowerEstimate)}W` : "--"
  );
  setMobileFlowText(
    "flowBatteryValue",
    `${data.batteryCurrent > 0.2 ? "↑" : data.batteryCurrent < -0.2 ? "↓" : "↔"} ${Math.round(batteryPower)}W`
  );
  setMobileFlowText("flowHomeValue", `${Math.round(Number(data.loadPower))}W`);

  const inverterNode = document.querySelector(".fn.iv");
  if (inverterNode) {
    inverterNode.classList.remove(
      "source-grid",
      "source-solar",
      "source-battery",
      "source-mixed"
    );
    inverterNode.classList.add(`source-${source.tone}`);
  }
  setMobileFlowText("mInvMode", source.label);

  // SRNE sign convention: positive = discharging, negative = charging.
  const batteryPath = document.getElementById("mobileBatteryPath");
  if (batteryPath) {
    batteryPath.setAttribute(
      "d",
      data.batteryCurrent > 0.2 ? "M180 422 V319" : "M180 319 V422"
    );
  }
}

const originalUpdateMobileCards = updateMobileCards;
updateMobileCards = function (data, source = "LIVE") {
  originalUpdateMobileCards(data, source);
  updateMobileFlow(data);
};
