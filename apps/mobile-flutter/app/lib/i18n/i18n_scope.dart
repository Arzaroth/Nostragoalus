import 'package:flutter/widgets.dart';

import 'i18n.dart';

/// Exposes the loaded [I18n] to the widget tree so leaf widgets translate via
/// `context.tr('key')` without threading a provider ref through every build.
class I18nScope extends InheritedWidget {
  const I18nScope({super.key, required this.i18n, required super.child});

  final I18n i18n;

  static I18n of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<I18nScope>();
    assert(scope != null, 'I18nScope missing above ${context.widget}');
    return scope!.i18n;
  }

  @override
  bool updateShouldNotify(I18nScope oldWidget) => oldWidget.i18n != i18n;
}

extension I18nContext on BuildContext {
  String tr(String key, [Map<String, Object?>? vars]) => I18nScope.of(this).t(key, vars);
}
