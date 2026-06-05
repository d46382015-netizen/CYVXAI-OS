"use strict";

function clamp(n,min=0,max=100){return Math.max(min,Math.min(max,Number(n)||0))}
function realityOsSnapshot(input={}){
  const agency=clamp(input.agency||87);
  const desired=clamp(input.desired||100);
  const current=agency;
  const drift=clamp(Math.round(((desired-current)/desired)*100));

  return {
    powered_by:"CYVX Ω",
    generated_at:new Date().toISOString(),
    digital_twin:{
      agency,
      confidence:91,
      trajectory:"ascending",
      mission_health:84,
      narrative:"Distribution remains the dominant constraint. Execution quality is improving, but capital and distribution still limit growth velocity."
    },
    reality_drift:{
      desired_reality:desired,
      current_reality:current,
      drift_percent:drift,
      closing_action:"Deploy highest-leverage distribution mission."
    },
    agency_decomposition:{
      execution:92,
      decision:88,
      attention:79,
      capital:34,
      distribution:42,
      learning:83,
      trust:91
    },
    leverage_multiplier:{
      input:"1 hour",
      revenue:12,
      agency:4,
      trust:7,
      learning:3
    },
    second_order_effects:[
      "More trust",
      "More distribution",
      "More opportunities",
      "More revenue"
    ],
    mission_dna:{
      id:"Mission Ω-291",
      revenue_potential:92,
      difficulty:31,
      risk:18,
      learning:87,
      strategic_value:94
    },
    nervous_system:{
      execution_latency:"+12%",
      attention_fragmentation:"+18%",
      trust:"stable",
      stress:"rising"
    },
    opportunity_decay:{
      value:120000,
      decay_per_day:"4%",
      time_remaining_days:21
    },
    unknown_detector:{
      known_known:83,
      known_unknown:14,
      unknown_unknown:3
    },
    future_fragments:[
      {future:"A",probability:63,label:"Distribution mission succeeds"},
      {future:"B",probability:22,label:"Execution slows"},
      {future:"C",probability:11,label:"Capital constraint increases"},
      {future:"D",probability:4,label:"Unexpected partnership"}
    ],
    self_modification_queue:[
      {upgrade:"Distribution Engine",expected_impact:"+14%",confidence:88},
      {upgrade:"Attention Collision Detector",expected_impact:"+9%",confidence:82}
    ]
  };
}

module.exports={realityOsSnapshot};
