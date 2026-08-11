import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { dbError } from "../core/db";
import { BRAND } from "../../src/config/branding";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
  width:  number;
  height: number;
}

export function WaitingScreen({ width, height }: Props) {
  const [tick, setTick]       = useState(0);
  const [errMsg, setErrMsg]   = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      setErrMsg(dbError());
    }, 500);
    return () => clearInterval(t);
  }, []);

  const spinner = SPINNER[tick % SPINNER.length]!;
  const err     = errMsg ?? dbError();

  return (
    <Box width={width} height={height} flexDirection="column"
         alignItems="center" justifyContent="center">
      <Box flexDirection="column" alignItems="center">
        <Text bold color="cyan">⚡ {BRAND.name.toUpperCase()} TUI</Text>
        <Box marginTop={1}>
          <Text color="yellow">{spinner} </Text>
          <Text color="gray">Waiting for bot database…</Text>
        </Box>

        {err && (
          <Box marginTop={1} flexDirection="column" alignItems="center">
            <Text color="red">{err.split("\n")[0]}</Text>
            {err.split("\n")[1] && (
              <Text color="gray">{err.split("\n")[1]}</Text>
            )}
          </Box>
        )}

        <Box marginTop={2} flexDirection="column" alignItems="center">
          <Text color="gray" dimColor>The TUI will connect automatically once</Text>
          <Text color="gray" dimColor>the bot creates its database.</Text>
          <Box marginTop={1}><Text color="gray" dimColor>[q / Ctrl+C] quit</Text></Box>
        </Box>
      </Box>
    </Box>
  );
}
