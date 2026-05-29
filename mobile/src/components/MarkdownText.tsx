import React, { useMemo } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

import { colors, radii, spacing } from "../theme/colors";
import { fontWeights } from "../theme/typography";
import { parseMarkdown } from "../utils/markdown";
import type { MarkdownBlock, MarkdownInlineNode } from "../utils/markdown";

type MarkdownTextProps = {
  text: string;
  variant?: "default" | "inverted";
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const monospace = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace"
});

export function MarkdownText({
  text,
  variant = "default",
  containerStyle,
  textStyle
}: MarkdownTextProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {blocks.map((block, index) => renderBlock(block, index, variant, textStyle))}
    </View>
  );
}

function renderBlock(
  block: MarkdownBlock,
  index: number,
  variant: NonNullable<MarkdownTextProps["variant"]>,
  textStyle: StyleProp<TextStyle>
) {
  const blockSpacing = index > 0 ? styles.blockSpacing : null;
  const key = `markdown-block-${index}`;

  if (block.type === "heading") {
    return (
      <Text
        key={key}
        style={[
          styles.text,
          variant === "inverted" ? styles.textInverted : null,
          headingStyle(block.level),
          blockSpacing,
          textStyle
        ]}
      >
        {renderInline(block.children, `${key}-inline`, variant)}
      </Text>
    );
  }

  if (block.type === "code") {
    return (
      <View
        key={key}
        style={[
          styles.codeBlock,
          variant === "inverted" ? styles.codeBlockInverted : null,
          blockSpacing
        ]}
      >
        {block.language ? (
          <Text style={[styles.codeLanguage, variant === "inverted" ? styles.textInvertedMuted : null]}>
            {block.language}
          </Text>
        ) : null}
        <Text
          selectable
          style={[
            styles.codeBlockText,
            variant === "inverted" ? styles.codeBlockTextInverted : null
          ]}
        >
          {block.text || " "}
        </Text>
      </View>
    );
  }

  if (block.type === "list") {
    return (
      <View key={key} style={[styles.list, blockSpacing]}>
        {block.items.map((item, itemIndex) => (
          <View key={`${key}-item-${itemIndex}`} style={styles.listRow}>
            <Text
              style={[
                styles.text,
                styles.listMarker,
                variant === "inverted" ? styles.textInvertedMuted : null,
                textStyle
              ]}
            >
              {block.ordered ? `${itemIndex + 1}.` : "-"}
            </Text>
            <Text
              style={[
                styles.text,
                styles.listText,
                variant === "inverted" ? styles.textInverted : null,
                textStyle
              ]}
            >
              {renderInline(item, `${key}-item-${itemIndex}-inline`, variant)}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.type === "quote") {
    return (
      <View
        key={key}
        style={[
          styles.quote,
          variant === "inverted" ? styles.quoteInverted : null,
          blockSpacing
        ]}
      >
        <Text
          style={[
            styles.text,
            styles.quoteText,
            variant === "inverted" ? styles.textInverted : null,
            textStyle
          ]}
        >
          {renderInline(block.children, `${key}-inline`, variant)}
        </Text>
      </View>
    );
  }

  if (block.type === "divider") {
    return (
      <View
        key={key}
        style={[
          styles.divider,
          variant === "inverted" ? styles.dividerInverted : null,
          blockSpacing
        ]}
      />
    );
  }

  return (
    <Text
      key={key}
      style={[
        styles.text,
        variant === "inverted" ? styles.textInverted : null,
        blockSpacing,
        textStyle
      ]}
    >
      {renderInline(block.children, `${key}-inline`, variant)}
    </Text>
  );
}

function renderInline(
  nodes: MarkdownInlineNode[],
  keyPrefix: string,
  variant: NonNullable<MarkdownTextProps["variant"]>
): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    if (node.type === "text") {
      return <React.Fragment key={key}>{node.text}</React.Fragment>;
    }

    if (node.type === "code") {
      return (
        <Text
          key={key}
          style={[
            styles.inlineCode,
            variant === "inverted" ? styles.inlineCodeInverted : null
          ]}
        >
          {node.text}
        </Text>
      );
    }

    if (node.type === "link") {
      return (
        <Text
          key={key}
          onPress={() => openLink(node.href)}
          style={[
            styles.link,
            variant === "inverted" ? styles.linkInverted : null
          ]}
        >
          {renderInline(node.children, key, variant)}
        </Text>
      );
    }

    if (node.type === "strong") {
      return (
        <Text key={key} style={styles.strong}>
          {renderInline(node.children, key, variant)}
        </Text>
      );
    }

    if (node.type === "emphasis") {
      return (
        <Text key={key} style={styles.emphasis}>
          {renderInline(node.children, key, variant)}
        </Text>
      );
    }

    return (
      <Text key={key} style={styles.deleted}>
        {renderInline(node.children, key, variant)}
      </Text>
    );
  });
}

function headingStyle(level: number) {
  if (level === 1) {
    return styles.headingOne;
  }
  if (level === 2) {
    return styles.headingTwo;
  }
  return styles.headingThree;
}

function openLink(href: string) {
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    void Linking.openURL(href);
  }
}

const styles = StyleSheet.create({
  container: {
    width: "100%"
  },
  blockSpacing: {
    marginTop: spacing.sm
  },
  text: {
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.body,
    lineHeight: 21
  },
  textInverted: {
    color: "#FFFFFF"
  },
  textInvertedMuted: {
    color: "rgba(255, 255, 255, 0.78)"
  },
  headingOne: {
    fontSize: 20,
    fontWeight: fontWeights.title,
    lineHeight: 26
  },
  headingTwo: {
    fontSize: 18,
    fontWeight: fontWeights.title,
    lineHeight: 24
  },
  headingThree: {
    fontSize: 16,
    fontWeight: fontWeights.action,
    lineHeight: 22
  },
  strong: {
    fontWeight: fontWeights.action
  },
  emphasis: {
    fontStyle: "italic"
  },
  deleted: {
    textDecorationLine: "line-through"
  },
  link: {
    color: colors.accent,
    fontWeight: fontWeights.subtitle,
    textDecorationLine: "underline"
  },
  linkInverted: {
    color: "#FFFFFF"
  },
  inlineCode: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    color: colors.code,
    fontFamily: monospace,
    fontSize: 13
  },
  inlineCodeInverted: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    color: "#FFFFFF"
  },
  codeBlock: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    gap: spacing.xs
  },
  codeBlockInverted: {
    borderColor: "rgba(255, 255, 255, 0.28)",
    backgroundColor: "rgba(16, 24, 40, 0.16)"
  },
  codeLanguage: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.label,
    textTransform: "uppercase"
  },
  codeBlockText: {
    color: colors.code,
    fontFamily: monospace,
    fontSize: 12,
    lineHeight: 17
  },
  codeBlockTextInverted: {
    color: "#FFFFFF"
  },
  list: {
    gap: spacing.xs
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  listMarker: {
    width: 24,
    textAlign: "right"
  },
  listText: {
    flex: 1,
    minWidth: 0
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: spacing.sm
  },
  quoteInverted: {
    borderLeftColor: "rgba(255, 255, 255, 0.42)"
  },
  quoteText: {
    color: colors.textMuted
  },
  divider: {
    height: 1,
    backgroundColor: colors.border
  },
  dividerInverted: {
    backgroundColor: "rgba(255, 255, 255, 0.28)"
  }
});
