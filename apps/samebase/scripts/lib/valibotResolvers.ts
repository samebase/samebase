import type { Plugins } from "@hey-api/openapi-ts";

export const valibotResolvers = {
  array(ctx) {
    if (!ctx.schema.items?.length) return;
    const { $, plugin, schema } = ctx;
    // The default Valibot emitter drops composed item schemas to unknown.
    ctx.nodes.base = () => {
      const item = ctx.walk(
        { items: schema.items, logicalOperator: schema.logicalOperator ?? "or" },
        ctx,
      );
      return $(plugin.imports.v)
        .attr("array")
        .call(ctx.pipes.toNode(ctx.applyModifiers(item).pipes, plugin));
    };
  },
  object(ctx) {
    const { $, plugin } = ctx;
    const { v } = plugin.imports;
    const additional = ctx.schema.additionalProperties;
    if (additional) {
      // The default emitter skips referenced and composed dictionary value schemas.
      ctx.nodes.additionalProperties = () => {
        if (additional.type === "never") return null;
        const child = ctx.walk(additional, {
          path: { "~ref": [...ctx.path["~ref"], "additionalProperties"] },
          plugin,
        });
        ctx._childResults.push(child);
        return ctx.pipes.toNode(ctx.applyModifiers(child).pipes, plugin);
      };
    }
    // Valibot object schemas can accept arrays. Check before they normalize the input.
    return [
      $(v).attr("unknown").call(),
      $(v)
        .attr("check")
        .call(
          $.func()
            .param("input")
            .do($.return($.prefix($("Array").attr("isArray").call("input")).not())),
        ),
      ctx.pipes.toNode(ctx.nodes.base(ctx), plugin),
    ];
  },
  number(ctx) {
    const { $ } = ctx;
    const { v } = ctx.plugin.imports;
    ctx.nodes.base = () => [
      $(v).attr("number").call(),
      $(v)
        .attr(ctx.schema.type === "integer" ? "safeInteger" : "finite")
        .call(),
    ];
  },
} satisfies Plugins.Valibot.Resolvers;
