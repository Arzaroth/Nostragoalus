import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// One bottom-nav destination.
class NavItem {
  const NavItem({required this.icon, required this.activeIcon, required this.label});
  final IconData icon;
  final IconData activeIcon;
  final String label;
}

/// The bottom bar: a thin board with a chalk top rule; the active tab is
/// marked by a short goal-line under its icon rather than a pill.
class AppNavBar extends StatelessWidget {
  const AppNavBar({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<NavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final scheme = theme.colorScheme;
    return Material(
      color: t.board,
      child: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: t.rule))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 60,
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: Semantics(
                      button: true,
                      selected: i == selectedIndex,
                      label: items[i].label,
                      child: InkWell(
                        onTap: () => onSelected(i),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              curve: Curves.easeOut,
                              width: i == selectedIndex ? 20 : 0,
                              height: 2,
                              margin: const EdgeInsets.only(bottom: 6),
                              decoration: BoxDecoration(
                                color: scheme.primary,
                                borderRadius: BorderRadius.circular(1),
                              ),
                            ),
                            Icon(
                              i == selectedIndex ? items[i].activeIcon : items[i].icon,
                              size: 22,
                              color: i == selectedIndex ? scheme.onSurface : t.muted,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              items[i].label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.labelSmall?.copyWith(
                                fontSize: 11,
                                fontWeight: i == selectedIndex ? FontWeight.w600 : FontWeight.w500,
                                color: i == selectedIndex ? scheme.onSurface : t.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
