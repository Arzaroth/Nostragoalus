import 'package:flutter/material.dart';

/// One entry of an [AppBarPicker].
class PickerOption<T> {
  const PickerOption({required this.value, required this.label});
  final T value;
  final String label;
}

/// The app bar's scope pickers (competition, league): an icon that opens a
/// checked menu of the values a screen can be narrowed to.
///
/// Both pickers sit in the same app bar, so they share this widget rather than
/// one copying the other - which is how their tooltips drifted apart the first
/// time.
class AppBarPicker<T> extends StatelessWidget {
  const AppBarPicker({
    super.key,
    required this.icon,
    required this.label,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  final IconData icon;

  /// Names the scope, e.g. "League: Office". Read out by screen readers and
  /// shown on a long press, which is the only thing that says what the icon
  /// narrows.
  final String label;

  final List<PickerOption<T>> options;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) return const SizedBox.shrink();
    return PopupMenuButton<T>(
      icon: Icon(icon),
      tooltip: label,
      onSelected: onSelected,
      itemBuilder: (context) => [
        for (final o in options)
          CheckedPopupMenuItem(
            value: o.value,
            checked: o.value == selected,
            child: Text(o.label, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
      ],
    );
  }
}
