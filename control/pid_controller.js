/**
 * CYVX — Autonomous Infrastructure Intelligence
 * © 2026 Dakota Lee Jonsgaard. All rights reserved.
 * Creator & Architect: Dakota Lee Jonsgaard
 * https://cyvx.ai | dakota@cyvx.ai
 *
 * This software is the exclusive intellectual property
 * of Dakota Lee Jonsgaard. Unauthorized use prohibited.
 */

const { createSubsystem, clamp } = require('../core/lib/cyxv');

class PIDController {
  constructor(kp = 1, ki = 0, kd = 0) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.integral = 0;
    this.prevError = 0;
  }

  step(setpoint, measurement) {
    const error = setpoint - measurement;
    this.integral += error;
    const derivative = error - this.prevError;
    this.prevError = error;
    return clamp(this.kp * error + this.ki * this.integral + this.kd * derivative, -1, 1);
  }
}

module.exports = Object.assign(createSubsystem('control/pid_controller', {
  category: 'control',
  description: 'PID controller'
}), {
  create: (kp, ki, kd) => new PIDController(kp, ki, kd),
  PIDController
});
