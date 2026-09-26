package dev.vannt.fixture;

public final class Greeter {
  private Greeter() {}

  public static String greet(String name) {
    return "hello, " + name;
  }
}
