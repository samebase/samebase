### parse

One validator per input. The caller reads the result at once.

| Tier                         | Failures | tuple           | tuple-index   | object        | object vs tuple |
| ---------------------------- | -------- | --------------- | ------------- | ------------- | --------------- |
| Ignition                     | 0%       | 101.7 ns, 208 B | 52.8 ns, 80 B | 45.3 ns, 56 B | -55%            |
| Sparkplug                    | 0%       | 64.6 ns, 208 B  | 31.1 ns, 80 B | 23.9 ns, 56 B | -63%            |
| Maglev                       | 0%       | 17.8 ns, 192 B  | 4.3 ns, 64 B  | 2.8 ns, 40 B  | -85%            |
| TurboFan                     | 0%       | 1.0 ns, 0 B     | 4.3 ns, 64 B  | 2.8 ns, 40 B  | +171%           |
| TurboFan, no escape analysis | 0%       | 7.8 ns, 152 B   | 4.4 ns, 64 B  | 2.8 ns, 40 B  | -64%            |
| Ignition                     | 10%      | 104.1 ns, 208 B | 55.1 ns, 80 B | 46.5 ns, 56 B | -55%            |
| Sparkplug                    | 10%      | 66.2 ns, 208 B  | 31.9 ns, 80 B | 26.4 ns, 56 B | -60%            |
| Maglev                       | 10%      | 12.6 ns, 192 B  | 5.1 ns, 64 B  | 3.9 ns, 40 B  | -69%            |
| TurboFan                     | 10%      | 3.8 ns, 64 B    | 5.2 ns, 64 B  | 3.9 ns, 40 B  | +1%             |
| TurboFan, no escape analysis | 10%      | 9.2 ns, 152 B   | 5.1 ns, 64 B  | 3.8 ns, 40 B  | -58%            |
| Ignition                     | 50%      | 113.0 ns, 208 B | 56.5 ns, 80 B | 50.4 ns, 56 B | -55%            |
| Sparkplug                    | 50%      | 72.1 ns, 208 B  | 36.9 ns, 80 B | 30.8 ns, 56 B | -57%            |
| Maglev                       | 50%      | 12.8 ns, 192 B  | 5.1 ns, 64 B  | 3.8 ns, 40 B  | -71%            |
| TurboFan                     | 50%      | 3.9 ns, 64 B    | 5.0 ns, 64 B  | 3.7 ns, 40 B  | -4%             |
| TurboFan, no escape analysis | 50%      | 8.6 ns, 152 B   | 5.0 ns, 64 B  | 3.7 ns, 40 B  | -57%            |

Largest max/min ratio between processes of one cell: 1.08

### store

One validator per input. The results go into an array and are read later.

| Tier      | Failures | tuple           | tuple-index    | object        | object vs tuple |
| --------- | -------- | --------------- | -------------- | ------------- | --------------- |
| Ignition  | 0%       | 118.7 ns, 248 B | 74.2 ns, 120 B | 65.9 ns, 96 B | -45%            |
| Sparkplug | 0%       | 75.5 ns, 248 B  | 44.5 ns, 120 B | 40.0 ns, 96 B | -47%            |
| Maglev    | 0%       | 14.4 ns, 232 B  | 9.9 ns, 104 B  | 9.3 ns, 80 B  | -35%            |
| TurboFan  | 0%       | 6.0 ns, 64 B    | 5.9 ns, 64 B   | 4.9 ns, 40 B  | -18%            |
| Ignition  | 10%      | 121.1 ns, 248 B | 75.9 ns, 120 B | 68.1 ns, 96 B | -44%            |
| Sparkplug | 10%      | 76.6 ns, 248 B  | 46.7 ns, 120 B | 43.9 ns, 96 B | -43%            |
| Maglev    | 10%      | 16.7 ns, 232 B  | 12.0 ns, 104 B | 11.2 ns, 80 B | -33%            |
| TurboFan  | 10%      | 7.2 ns, 104 B   | 6.0 ns, 64 B   | 5.5 ns, 40 B  | -23%            |
| Ignition  | 50%      | 126.1 ns, 248 B | 82.4 ns, 120 B | 76.7 ns, 96 B | -39%            |
| Sparkplug | 50%      | 84.7 ns, 248 B  | 55.6 ns, 120 B | 50.2 ns, 96 B | -41%            |
| Maglev    | 50%      | 20.3 ns, 232 B  | 15.4 ns, 104 B | 14.2 ns, 80 B | -30%            |
| TurboFan  | 50%      | 8.2 ns, 104 B   | 6.8 ns, 64 B   | 6.4 ns, 40 B  | -22%            |

Largest max/min ratio between processes of one cell: 1.33

### chain

Three validators in sequence. A failure stops the chain.

| Tier                         | Failures | tuple           | tuple-index     | object          | object vs tuple |
| ---------------------------- | -------- | --------------- | --------------- | --------------- | --------------- |
| Ignition                     | 0%       | 329.3 ns, 624 B | 166.9 ns, 240 B | 132.9 ns, 168 B | -60%            |
| Sparkplug                    | 0%       | 194.4 ns, 624 B | 89.2 ns, 240 B  | 72.0 ns, 168 B  | -63%            |
| Maglev                       | 0%       | 49.8 ns, 576 B  | 16.4 ns, 192 B  | 12.4 ns, 120 B  | -75%            |
| TurboFan                     | 0%       | 1.6 ns, 0 B     | 15.1 ns, 192 B  | 11.5 ns, 120 B  | +636%           |
| TurboFan, no escape analysis | 0%       | 23.2 ns, 457 B  | 15.2 ns, 192 B  | 11.4 ns, 120 B  | -51%            |
| Ignition                     | 10%      | 323.2 ns, 633 B | 158.4 ns, 246 B | 136.8 ns, 266 B | -58%            |
| Sparkplug                    | 10%      | 201.5 ns, 633 B | 91.0 ns, 246 B  | 84.5 ns, 266 B  | -58%            |
| Maglev                       | 10%      | 44.4 ns, 570 B  | 17.8 ns, 184 B  | 19.1 ns, 160 B  | -57%            |
| TurboFan                     | 10%      | 27.2 ns, 451 B  | 16.5 ns, 184 B  | 16.7 ns, 160 B  | -39%            |
| TurboFan, no escape analysis | 10%      | 26.9 ns, 451 B  | 16.3 ns, 184 B  | 16.7 ns, 160 B  | -38%            |
| Ignition                     | 50%      | 311.8 ns, 605 B | 137.5 ns, 206 B | 125.3 ns, 208 B | -60%            |
| Sparkplug                    | 50%      | 201.7 ns, 605 B | 85.5 ns, 206 B  | 76.2 ns, 208 B  | -62%            |
| Maglev                       | 50%      | 48.7 ns, 544 B  | 19.0 ns, 152 B  | 18.4 ns, 127 B  | -62%            |
| TurboFan                     | 50%      | 25.0 ns, 431 B  | 14.6 ns, 152 B  | 14.7 ns, 128 B  | -41%            |
| TurboFan, no escape analysis | 50%      | 24.8 ns, 431 B  | 14.4 ns, 152 B  | 14.7 ns, 128 B  | -41%            |

Largest max/min ratio between processes of one cell: 1.11

### schema

A record with 4 fields, one of them an array, as a Sure object schema.

| Tier      | Failures | tuple             | object           | sure              | object vs tuple |
| --------- | -------- | ----------------- | ---------------- | ----------------- | --------------- |
| Ignition  | 0%       | 1002.1 ns, 2163 B | 561.8 ns, 1185 B | 1565.5 ns, 3043 B | -44%            |
| Sparkplug | 0%       | 662.8 ns, 2163 B  | 368.9 ns, 1185 B | 1010.8 ns, 3043 B | -44%            |
| Maglev    | 0%       | 185.5 ns, 1976 B  | 123.3 ns, 998 B  | 347.6 ns, 2928 B  | -34%            |
| TurboFan  | 0%       | 90.6 ns, 599 B    | 88.3 ns, 524 B   | 228.1 ns, 1087 B  | -3%             |
| Ignition  | 10%      | 1035.9 ns, 2178 B | 580.5 ns, 1192 B | 1575.9 ns, 3061 B | -44%            |
| Sparkplug | 10%      | 672.4 ns, 2178 B  | 377.9 ns, 1192 B | 1032.2 ns, 3061 B | -44%            |
| Maglev    | 10%      | 190.8 ns, 2047 B  | 135.1 ns, 1060 B | 341.1 ns, 2945 B  | -29%            |
| TurboFan  | 10%      | 121.1 ns, 1016 B  | 109.4 ns, 660 B  | 239.7 ns, 1187 B  | -10%            |
| Ignition  | 50%      | 1063.4 ns, 2201 B | 603.7 ns, 1207 B | 1586.1 ns, 3093 B | -43%            |
| Sparkplug | 50%      | 697.3 ns, 2201 B  | 395.8 ns, 1207 B | 1061.8 ns, 3093 B | -43%            |
| Maglev    | 50%      | 200.8 ns, 2068 B  | 152.6 ns, 1074 B | 357.1 ns, 2976 B  | -24%            |
| TurboFan  | 50%      | 119.5 ns, 1030 B  | 114.9 ns, 673 B  | 248.4 ns, 1209 B  | -4%             |

Largest max/min ratio between processes of one cell: 1.57

All variants of each workload and failure rate returned the same checksum.
