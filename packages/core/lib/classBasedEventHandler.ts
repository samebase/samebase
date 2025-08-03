// import { Facet } from '@codemirror/state';
// import { DOMEventHandlers, DOMEventMap, EditorView } from '@codemirror/view';

// export const runClassBasedEventHandlers = ViewPlugin.define(()=>({}), {

// });

// type ClassBasedEventHandlersIntermediate<This> = {
//   [event in keyof DOMEventMap]?: {
//     [className: string]: DOMEventHandlers<This>[event][];
//   };
// };

// export const classBasedEventHandlerFacet = Facet.define<
//   ClassBasedEventHandlers<{}>,
//   ClassBasedEventHandlers<{}>
// >({
//   combine(value: readonly ClassBasedEventHandlers<{}>[]) {
//     // Combine all handlers into an array of handlers per event per class
//     let acc: ClassBasedEventHandlersIntermediate<{}> = {};
//     for (const cur of value) {
//       for (const event in cur) {
//         const curHandlers = cur[event];
//         if (!curHandlers) continue;

//         const accHandlers = acc[event];

//         if (accHandlers) {
//           for (const className in curHandlers) {
//             let accHandlerList;
//             if (
//               className in accHandlers &&
//               (accHandlerList = accHandlers[className])
//             ) {
//               accHandlerList.push(curHandlers[className]);
//             } else {
//               accHandlers[className] = [curHandlers[className]];
//             }
//           }
//         }
//       }
//     }

//     let result: ClassBasedEventHandlers<{}> = {};

//     // Generate group handlers
//     for (const event in acc) {
//       const accHandlers = acc[event];
//       if (!accHandlers) continue;

//       result[event] = {};

//       for (const className in accHandlers) {
//         if (accHandlers[className].length === 1) {
//           result[event]![className] = accHandlers[className][0];
//         } else {
//           result[event]![className] = function (
//             this: {},
//             e: any,
//             view: EditorView,
//           ) {
//             let res = [];
//             for (const handler of accHandlers[className]) {
//               res.push(handler?.call(this, e, view));
//             }
//             return res.some((res) => !!res);
//           };
//         }
//       }
//     }

//     return result;
//   },
//   enables: [],
// });
