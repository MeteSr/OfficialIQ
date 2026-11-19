import Map "mo:core/Map";
import List "mo:core/List";
import Order "mo:core/Order";
import Text "mo:core/Text";

// One-to-many secondary index: key -> row ids, in insertion order.
//
// Lets a per-user query read just that user's rows instead of scanning the
// whole table (which costs instructions in proportion to every user's data,
// and eventually exceeds a query's instruction limit).
//
// A canister adds an index as a new stable var whose initializer builds it
// from the existing table; that initializer runs once, on the upgrade that
// introduces the var, so existing rows are indexed without a migration.
module {
  public type Index<K> = Map.Map<K, List.List<Text>>;

  public func empty<K>() : Index<K> = Map.empty<K, List.List<Text>>();

  public func add<K>(ix : Index<K>, compare : (K, K) -> Order.Order, key : K, id : Text) {
    switch (Map.get(ix, compare, key)) {
      case (?ids) List.add(ids, id);
      case null Map.add(ix, compare, key, List.singleton<Text>(id));
    }
  };

  public func ids<K>(ix : Index<K>, compare : (K, K) -> Order.Order, key : K) : [Text] {
    switch (Map.get(ix, compare, key)) {
      case (?ids) List.toArray(ids);
      case null [];
    }
  };

  /// The rows of `table` that `key` points at, in index order. Ids whose row
  /// is gone are skipped.
  public func rows<K, V>(ix : Index<K>, compare : (K, K) -> Order.Order, key : K, table : Map.Map<Text, V>) : [V] {
    let out = List.empty<V>();
    switch (Map.get(ix, compare, key)) {
      case (?ids) {
        for (id in List.values(ids)) {
          switch (Map.get(table, Text.compare, id)) { case (?v) List.add(out, v); case null {} };
        };
      };
      case null {};
    };
    List.toArray(out)
  };

  /// Drops `key` and returns the ids it pointed at.
  public func take<K>(ix : Index<K>, compare : (K, K) -> Order.Order, key : K) : [Text] {
    switch (Map.take(ix, compare, key)) {
      case (?ids) List.toArray(ids);
      case null [];
    }
  };

  /// Removes one id from `key`'s list.
  public func removeId<K>(ix : Index<K>, compare : (K, K) -> Order.Order, key : K, id : Text) {
    switch (Map.get(ix, compare, key)) {
      case (?ids) {
        let kept = List.filter<Text>(ids, func(x) { x != id });
        if (List.isEmpty(kept)) Map.remove(ix, compare, key) else Map.add(ix, compare, key, kept);
      };
      case null {};
    }
  };
}
