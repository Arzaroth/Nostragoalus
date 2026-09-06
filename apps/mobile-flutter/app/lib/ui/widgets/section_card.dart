import 'package:flutter/material.dart';

import 'panel.dart';

/// A titled board: the condensed heading above, the content on one surface.
/// [children] that are rows are separated by hairlines; free-form content
/// passes [padded] to get an inner inset instead.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.title,
    required this.children,
    this.trailing,
    this.action,
    this.padded = false,
    this.dividers = true,
  });

  final String title;
  final List<Widget> children;
  final String? trailing;
  final Widget? action;
  final bool padded;
  final bool dividers;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PanelHeading(title: title, trailing: trailing, action: action),
          Panel(
            padding: padded ? const EdgeInsets.all(16) : null,
            dividers: dividers && !padded,
            children: children,
          ),
        ],
      );
}
